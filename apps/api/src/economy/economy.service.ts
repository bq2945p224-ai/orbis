import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  bankAccounts,
  characters,
  ledgerEntries,
  systemAccounts,
  and,
  desc,
  eq,
  sql,
} from "@orbis/db";
import { WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { ConfigService } from "../core/config.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class EconomyService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async ensureWallet(characterId: string, startingCents?: number) {
    const db = this.dbService.db;
    const [existing] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.characterId, characterId))
      .limit(1);
    if (existing) return existing;

    const balance = startingCents ?? this.config.env.STARTING_BALANCE_CENTS;
    return db.transaction(async (tx) => {
      const [account] = await tx
        .insert(bankAccounts)
        .values({ characterId, balanceCents: balance })
        .onConflictDoNothing()
        .returning();
      if (!account) {
        const [again] = await tx
          .select()
          .from(bankAccounts)
          .where(eq(bankAccounts.characterId, characterId))
          .limit(1);
        if (!again) throw new Error("failed to create bank account");
        return again;
      }
      if (balance > 0) {
        await tx.insert(ledgerEntries).values({
          idempotencyKey: `signup-grant:${characterId}`,
          fromAccountId: null,
          toAccountId: account.id,
          amountCents: balance,
          reason: "signup_grant",
          metadata: {},
        });
      }
      return account;
    });
  }

  async getWallet(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const wallet = await this.ensureWallet(character.id);
    const recent = await db
      .select()
      .from(ledgerEntries)
      .where(
        sql`${ledgerEntries.fromAccountId} = ${wallet.id} OR ${ledgerEntries.toAccountId} = ${wallet.id}`,
      )
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(20);

    return {
      characterId: character.id,
      currency: wallet.currency,
      balanceCents: wallet.balanceCents,
      recent: recent.map((row) => ({
        id: row.id,
        amountCents: row.amountCents,
        reason: row.reason,
        direction:
          row.toAccountId === wallet.id
            ? ("credit" as const)
            : ("debit" as const),
        createdAt: row.createdAt,
        metadata: row.metadata,
      })),
    };
  }

  async transfer(
    account: AuthedAccount,
    input: {
      toCharacterId: string;
      amountCents: number;
      idempotencyKey: string;
      note?: string;
    },
  ) {
    const db = this.dbService.db;
    const fromCharacter = await requireLivingCharacter(db, account);
    if (fromCharacter.id === input.toCharacterId) {
      throw new BadRequestException("Cannot transfer to yourself");
    }

    const [toCharacter] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, input.toCharacterId), eq(characters.status, "alive")))
      .limit(1);
    if (!toCharacter) throw new NotFoundException("Recipient character not found");

    const fromWallet = await this.ensureWallet(fromCharacter.id, 0);
    const toWallet = await this.ensureWallet(toCharacter.id, 0);

    const [existing] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        idempotent: true,
        entryId: existing.id,
        amountCents: existing.amountCents,
      };
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${fromWallet.id}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${toWallet.id}))`);

      const [lockedFrom] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.id, fromWallet.id))
        .limit(1);
      const [lockedTo] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.id, toWallet.id))
        .limit(1);
      if (!lockedFrom || !lockedTo) throw new BadRequestException("Bank account missing");

      if (lockedFrom.balanceCents < input.amountCents) {
        throw new BadRequestException("Insufficient funds");
      }

      await tx
        .update(bankAccounts)
        .set({
          balanceCents: lockedFrom.balanceCents - input.amountCents,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, lockedFrom.id));
      await tx
        .update(bankAccounts)
        .set({
          balanceCents: lockedTo.balanceCents + input.amountCents,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, lockedTo.id));

      try {
        const [entry] = await tx
          .insert(ledgerEntries)
          .values({
            idempotencyKey: input.idempotencyKey,
            fromAccountId: lockedFrom.id,
            toAccountId: lockedTo.id,
            amountCents: input.amountCents,
            reason: "player_transfer",
            metadata: {
              fromCharacterId: fromCharacter.id,
              toCharacterId: toCharacter.id,
              note: input.note ?? null,
            },
          })
          .returning();
        if (!entry) throw new Error("ledger insert failed");
        return entry;
      } catch (err) {
        const [race] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (race) return race;
        throw err;
      }
    });

    await this.events.emit({
      type: WorldEventType.LedgerTransfer,
      payload: {
        fromCharacterId: fromCharacter.id,
        toCharacterId: toCharacter.id,
        amountCents: input.amountCents,
        entryId: result.id,
      },
      actorCharacterId: fromCharacter.id,
      subjectType: "ledger_entry",
      subjectId: result.id,
    });

    return {
      idempotent: false,
      entryId: result.id,
      amountCents: result.amountCents,
    };
  }

  async debitCharacter(
    characterId: string,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (amountCents <= 0) throw new BadRequestException("Amount must be positive");
    const db = this.dbService.db;
    const wallet = await this.ensureWallet(characterId, 0);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${wallet.id}))`);
      const [locked] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.id, wallet.id))
        .limit(1);
      if (!locked) throw new BadRequestException("Bank account missing");
      if (locked.balanceCents < amountCents) {
        throw new BadRequestException("Insufficient funds");
      }

      await tx
        .update(bankAccounts)
        .set({
          balanceCents: locked.balanceCents - amountCents,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, locked.id));

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          idempotencyKey,
          fromAccountId: locked.id,
          toAccountId: null,
          amountCents,
          reason,
          metadata,
        })
        .onConflictDoNothing()
        .returning();

      if (!entry) {
        const [existing] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
          .limit(1);
        return existing!;
      }
      return entry;
    });
  }

  async creditCharacter(
    characterId: string,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (amountCents <= 0) return null;
    const db = this.dbService.db;
    const wallet = await this.ensureWallet(characterId, 0);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${wallet.id}))`);
      const [locked] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.id, wallet.id))
        .limit(1);
      if (!locked) throw new BadRequestException("Bank account missing");

      await tx
        .update(bankAccounts)
        .set({
          balanceCents: locked.balanceCents + amountCents,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, locked.id));

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          idempotencyKey,
          fromAccountId: null,
          toAccountId: locked.id,
          amountCents,
          reason,
          metadata,
        })
        .onConflictDoNothing()
        .returning();
      return entry;
    });
  }

  async creditSystemTreasury(
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (amountCents <= 0) return null;
    const db = this.dbService.db;

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('world_treasury'))`);

      await tx
        .insert(systemAccounts)
        .values({ key: "world_treasury", balanceCents: amountCents })
        .onConflictDoUpdate({
          target: systemAccounts.key,
          set: {
            balanceCents: sql`${systemAccounts.balanceCents} + ${amountCents}`,
            updatedAt: new Date(),
          },
        });

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          idempotencyKey,
          fromAccountId: null,
          toAccountId: null,
          amountCents,
          reason,
          metadata: { systemAccount: "world_treasury", ...metadata },
        })
        .onConflictDoNothing()
        .returning();

      if (!entry) {
        const [existing] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
          .limit(1);
        return existing;
      }
      return entry;
    });
  }

  async debitSystemTreasury(
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (amountCents <= 0) throw new BadRequestException("Amount must be positive");
    const db = this.dbService.db;

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('world_treasury'))`);

      const [treasury] = await tx
        .select()
        .from(systemAccounts)
        .where(eq(systemAccounts.key, "world_treasury"))
        .limit(1);

      const balance = treasury?.balanceCents ?? 0;
      if (balance < amountCents) {
        throw new BadRequestException("Insufficient treasury funds");
      }

      await tx
        .update(systemAccounts)
        .set({
          balanceCents: balance - amountCents,
          updatedAt: new Date(),
        })
        .where(eq(systemAccounts.key, "world_treasury"));

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          idempotencyKey,
          fromAccountId: null,
          toAccountId: null,
          amountCents,
          reason,
          metadata: { systemAccount: "world_treasury", direction: "debit", ...metadata },
        })
        .onConflictDoNothing()
        .returning();

      if (!entry) {
        const [existing] = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
          .limit(1);
        return existing!;
      }
      return entry;
    });
  }
}
