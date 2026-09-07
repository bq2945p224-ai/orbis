import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  characters,
  inventories,
  loans,
  marketListings,
  and,
  desc,
  eq,
  sql,
} from "@orbis/db";
import {
  loanRequestSchema,
  marketBuySchema,
  marketListSchema,
  WorldEventType,
} from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

const OWNER_TYPE_CHARACTER = "character";

@Injectable()
export class MarketsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  async listListings(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: marketListings.id,
        sellerCharacterId: marketListings.sellerCharacterId,
        sellerName: characters.name,
        itemKey: marketListings.itemKey,
        quantity: marketListings.quantity,
        priceCentsEach: marketListings.priceCentsEach,
        createdAt: marketListings.createdAt,
      })
      .from(marketListings)
      .leftJoin(characters, eq(marketListings.sellerCharacterId, characters.id))
      .where(eq(marketListings.open, true))
      .orderBy(desc(marketListings.createdAt));

    return { listings: rows };
  }

  async createListing(account: AuthedAccount, body: unknown) {
    const input = marketListSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [inventory] = await db
      .select()
      .from(inventories)
      .where(
        and(
          eq(inventories.ownerType, OWNER_TYPE_CHARACTER),
          eq(inventories.ownerId, character.id),
          eq(inventories.itemKey, input.itemKey),
        ),
      )
      .limit(1);

    if (!inventory || inventory.quantity < input.quantity) {
      throw new BadRequestException("Insufficient inventory");
    }

    await db.transaction(async (tx) => {
      const newQty = inventory.quantity - input.quantity;
      if (newQty === 0) {
        await tx.delete(inventories).where(eq(inventories.id, inventory.id));
      } else {
        await tx
          .update(inventories)
          .set({ quantity: newQty })
          .where(eq(inventories.id, inventory.id));
      }

      await tx.insert(marketListings).values({
        sellerCharacterId: character.id,
        itemKey: input.itemKey,
        quantity: input.quantity,
        priceCentsEach: input.priceCentsEach,
        open: true,
      });
    });

    const [listing] = await db
      .select()
      .from(marketListings)
      .where(
        and(
          eq(marketListings.sellerCharacterId, character.id),
          eq(marketListings.itemKey, input.itemKey),
          eq(marketListings.open, true),
        ),
      )
      .orderBy(desc(marketListings.createdAt))
      .limit(1);

    return {
      listingId: listing!.id,
      itemKey: input.itemKey,
      quantity: input.quantity,
      priceCentsEach: input.priceCentsEach,
    };
  }

  async buy(account: AuthedAccount, body: unknown) {
    const input = marketBuySchema.parse(body);
    const db = this.dbService.db;
    const buyer = await requireLivingCharacter(db, account);

    const [listing] = await db
      .select()
      .from(marketListings)
      .where(and(eq(marketListings.id, input.listingId), eq(marketListings.open, true)))
      .limit(1);
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.quantity < input.quantity) {
      throw new BadRequestException("Insufficient quantity available");
    }
    if (listing.sellerCharacterId === buyer.id) {
      throw new BadRequestException("Cannot buy your own listing");
    }

    const totalCents = listing.priceCentsEach * input.quantity;
    const idempotencyKey = `market-buy:${listing.id}:${buyer.id}:${input.quantity}`;

    await this.economy.debitCharacter(
      buyer.id,
      totalCents,
      "market_purchase",
      idempotencyKey,
      { listingId: listing.id, itemKey: listing.itemKey, quantity: input.quantity },
    );

    if (listing.sellerCharacterId) {
      await this.economy.creditCharacter(
        listing.sellerCharacterId,
        totalCents,
        "market_sale",
        `${idempotencyKey}:seller`,
        { listingId: listing.id, buyerCharacterId: buyer.id },
      );
    }

    await db.transaction(async (tx) => {
      const remaining = listing.quantity - input.quantity;
      if (remaining === 0) {
        await tx
          .update(marketListings)
          .set({ open: false, quantity: 0 })
          .where(eq(marketListings.id, listing.id));
      } else {
        await tx
          .update(marketListings)
          .set({ quantity: remaining })
          .where(eq(marketListings.id, listing.id));
      }

      await tx
        .insert(inventories)
        .values({
          ownerType: OWNER_TYPE_CHARACTER,
          ownerId: buyer.id,
          itemKey: listing.itemKey,
          quantity: input.quantity,
        })
        .onConflictDoUpdate({
          target: [inventories.ownerType, inventories.ownerId, inventories.itemKey],
          set: {
            quantity: sql`${inventories.quantity} + ${input.quantity}`,
          },
        });
    });

    await this.events.emit({
      type: WorldEventType.MarketTrade,
      payload: {
        listingId: listing.id,
        buyerCharacterId: buyer.id,
        sellerCharacterId: listing.sellerCharacterId,
        itemKey: listing.itemKey,
        quantity: input.quantity,
        totalCents,
      },
      actorCharacterId: buyer.id,
      subjectType: "market_listing",
      subjectId: listing.id,
    });

    return {
      listingId: listing.id,
      itemKey: listing.itemKey,
      quantity: input.quantity,
      totalCents,
    };
  }

  async requestLoan(account: AuthedAccount, body: unknown) {
    const input = loanRequestSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const idempotencyKey = `loan:${character.id}:${input.principalCents}:${Date.now()}`;

    await this.economy.debitSystemTreasury(
      input.principalCents,
      "loan_disbursement",
      idempotencyKey,
      { borrowerCharacterId: character.id },
    );

    await this.economy.creditCharacter(
      character.id,
      input.principalCents,
      "loan_proceeds",
      `${idempotencyKey}:credit`,
      { principalCents: input.principalCents },
    );

    const [loan] = await db
      .insert(loans)
      .values({
        borrowerCharacterId: character.id,
        principalCents: input.principalCents,
        remainingCents: input.principalCents,
        status: "active",
      })
      .returning();

    if (!loan) throw new BadRequestException("Could not create loan");

    await this.events.emit({
      type: WorldEventType.LoanIssued,
      payload: {
        loanId: loan.id,
        principalCents: input.principalCents,
      },
      actorCharacterId: character.id,
      subjectType: "loan",
      subjectId: loan.id,
    });

    return {
      loanId: loan.id,
      principalCents: loan.principalCents,
      remainingCents: loan.remainingCents,
      interestBps: loan.interestBps,
    };
  }

  async myLoans(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const rows = await db
      .select()
      .from(loans)
      .where(eq(loans.borrowerCharacterId, character.id))
      .orderBy(desc(loans.createdAt));

    return { loans: rows };
  }
}
