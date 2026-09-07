import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assetDefinitions,
  assetListings,
  bankAccounts,
  buildings,
  characterAssets,
  companies,
  companyShares,
  inventories,
  landParcels,
  parcelOwnerships,
  resourceDefinitions,
  and,
  desc,
  eq,
} from "@orbis/db";
import { buyAssetListingSchema, LAND_BASE_CENTS_PER_M2, WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

/** Commodity stockpiles only count as assets above this estimated value. */
const COMMODITY_ASSET_MIN_CENTS = 50_000; // 500 ORB
const COMMODITY_CENTS_PER_UNIT: Record<string, number> = {
  crude_oil: 80,
  natural_gas: 60,
  iron: 40,
  copper: 120,
  coal: 25,
  gold: 5_000,
  timber: 30,
  fertile_soil: 20,
};

@Injectable()
export class AssetsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  async portfolio(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [wallet] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.characterId, character.id))
      .limit(1);

    const cashCents = wallet?.balanceCents ?? 0;

    const propertyRows = await db
      .select({
        parcelId: parcelOwnerships.parcelId,
        acquiredAt: parcelOwnerships.acquiredAt,
        acquisition: parcelOwnerships.acquisition,
        areaM2: landParcels.areaM2,
        label: landParcels.label,
        landType: landParcels.landType,
        origin: landParcels.origin,
        gridIx: landParcels.gridIx,
        gridIy: landParcels.gridIy,
      })
      .from(parcelOwnerships)
      .innerJoin(landParcels, eq(parcelOwnerships.parcelId, landParcels.id))
      .where(eq(parcelOwnerships.ownerCharacterId, character.id))
      .orderBy(desc(parcelOwnerships.acquiredAt));

    const properties = propertyRows.map((row) => {
      const estimatedValueCents = row.areaM2 * LAND_BASE_CENTS_PER_M2;
      return {
        kind: "property" as const,
        id: row.parcelId,
        title: row.label ?? `Parcel ${row.parcelId.slice(0, 8)}`,
        category: "property",
        subtitle:
          row.origin === "grid" && row.gridIx != null
            ? `Grid ${row.gridIx},${row.gridIy} · ${row.areaM2.toLocaleString()} m²`
            : `${row.landType} · ${row.areaM2.toLocaleString()} m²`,
        estimatedValueCents,
        acquiredAt: row.acquiredAt,
        href: `/map?parcel=${row.parcelId}`,
      };
    });

    const buildingRows = await db
      .select({
        id: buildings.id,
        name: buildings.name,
        buildingType: buildings.buildingType,
        condition: buildings.condition,
        parcelId: buildings.parcelId,
        createdAt: buildings.createdAt,
      })
      .from(buildings)
      .innerJoin(parcelOwnerships, eq(buildings.parcelId, parcelOwnerships.parcelId))
      .where(eq(parcelOwnerships.ownerCharacterId, character.id));

    const structures = buildingRows.map((row) => ({
      kind: "building" as const,
      id: row.id,
      title: row.name,
      category: "building",
      subtitle: `${row.buildingType} · condition ${row.condition}`,
      estimatedValueCents: 20_000 + row.condition * 100,
      acquiredAt: row.createdAt,
      href: "/property",
    }));

    const heldAssets = await db
      .select({
        id: characterAssets.id,
        assetKey: characterAssets.assetKey,
        title: characterAssets.title,
        estimatedValueCents: characterAssets.estimatedValueCents,
        quantity: characterAssets.quantity,
        condition: characterAssets.condition,
        acquiredAt: characterAssets.acquiredAt,
        acquiredHow: characterAssets.acquiredHow,
        metadata: characterAssets.metadata,
        category: assetDefinitions.category,
        definitionName: assetDefinitions.name,
      })
      .from(characterAssets)
      .innerJoin(assetDefinitions, eq(characterAssets.assetKey, assetDefinitions.key))
      .where(eq(characterAssets.characterId, character.id))
      .orderBy(desc(characterAssets.estimatedValueCents));

    const moveable = heldAssets.map((row) => ({
      kind: "asset" as const,
      id: row.id,
      title: row.title,
      category: row.category,
      subtitle: `${row.definitionName} · qty ${row.quantity} · condition ${row.condition}`,
      estimatedValueCents: row.estimatedValueCents * row.quantity,
      acquiredAt: row.acquiredAt,
      assetKey: row.assetKey,
      metadata: row.metadata,
    }));

    const equityRows = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        shares: companyShares.shares,
        treasuryCents: companies.treasuryCents,
      })
      .from(companyShares)
      .innerJoin(companies, eq(companyShares.companyId, companies.id))
      .where(eq(companyShares.characterId, character.id));

    const equity = equityRows.map((row) => {
      // Rough book value: ownership share of treasury (founder typically holds 100).
      const totalShares = 100;
      const estimatedValueCents = Math.floor((row.treasuryCents * row.shares) / totalShares);
      return {
        kind: "equity" as const,
        id: row.companyId,
        title: row.companyName,
        category: "equity",
        subtitle: `${row.shares} shares`,
        estimatedValueCents,
        href: "/companies",
      };
    });

    const invRows = await db
      .select({
        itemKey: inventories.itemKey,
        quantity: inventories.quantity,
        name: resourceDefinitions.name,
        unit: resourceDefinitions.unit,
      })
      .from(inventories)
      .innerJoin(resourceDefinitions, eq(inventories.itemKey, resourceDefinitions.key))
      .where(
        and(eq(inventories.ownerType, "character"), eq(inventories.ownerId, character.id)),
      );

    const commodities = invRows
      .map((row) => {
        const unitCents = COMMODITY_CENTS_PER_UNIT[row.itemKey] ?? 10;
        const estimatedValueCents = row.quantity * unitCents;
        return {
          kind: "commodity" as const,
          id: row.itemKey,
          title: row.name,
          category: "commodity",
          subtitle: `${row.quantity.toLocaleString()} ${row.unit}`,
          estimatedValueCents,
          quantity: row.quantity,
        };
      })
      .filter((row) => row.estimatedValueCents >= COMMODITY_ASSET_MIN_CENTS);

    const cashItem = {
      kind: "cash" as const,
      id: "wallet",
      title: "Bank balance",
      category: "cash",
      subtitle: wallet?.currency ?? "ORB",
      estimatedValueCents: cashCents,
      href: "/character",
    };

    const items = [
      cashItem,
      ...properties,
      ...structures,
      ...moveable,
      ...equity,
      ...commodities,
    ];

    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + item.estimatedValueCents;
    }

    const netWorthCents = items.reduce((sum, item) => sum + item.estimatedValueCents, 0);

    return {
      characterId: character.id,
      netWorthCents,
      currency: wallet?.currency ?? "ORB",
      byCategory,
      sections: {
        cash: [cashItem],
        properties,
        buildings: structures,
        vehicles: moveable.filter((a) => a.category === "vehicle"),
        art: moveable.filter((a) => a.category === "art"),
        jewelry: moveable.filter((a) => a.category === "jewelry"),
        collectibles: moveable.filter((a) => a.category === "collectible"),
        vessels: moveable.filter((a) => a.category === "vessel"),
        aircraft: moveable.filter((a) => a.category === "aircraft"),
        otherMovable: moveable.filter(
          (a) =>
            !["vehicle", "art", "jewelry", "collectible", "vessel", "aircraft"].includes(
              a.category,
            ),
        ),
        equity,
        commodities,
      },
      items,
    };
  }

  async listMarket(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: assetListings.id,
        assetKey: assetListings.assetKey,
        title: assetListings.title,
        priceCents: assetListings.priceCents,
        metadata: assetListings.metadata,
        createdAt: assetListings.createdAt,
        category: assetDefinitions.category,
        definitionName: assetDefinitions.name,
        sellerCharacterId: assetListings.sellerCharacterId,
      })
      .from(assetListings)
      .innerJoin(assetDefinitions, eq(assetListings.assetKey, assetDefinitions.key))
      .where(eq(assetListings.open, true))
      .orderBy(desc(assetListings.createdAt));

    return {
      listings: rows.map((row) => ({
        ...row,
        sellerName: row.sellerCharacterId ? "Player" : "World Government",
      })),
    };
  }

  async buyListing(account: AuthedAccount, body: unknown) {
    const input = buyAssetListingSchema.parse(body);
    const db = this.dbService.db;
    const buyer = await requireLivingCharacter(db, account);

    const [listing] = await db
      .select({
        id: assetListings.id,
        assetKey: assetListings.assetKey,
        title: assetListings.title,
        priceCents: assetListings.priceCents,
        metadata: assetListings.metadata,
        sellerCharacterId: assetListings.sellerCharacterId,
        open: assetListings.open,
        baseValueCents: assetDefinitions.baseValueCents,
        category: assetDefinitions.category,
      })
      .from(assetListings)
      .innerJoin(assetDefinitions, eq(assetListings.assetKey, assetDefinitions.key))
      .where(and(eq(assetListings.id, input.listingId), eq(assetListings.open, true)))
      .limit(1);

    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.sellerCharacterId === buyer.id) {
      throw new BadRequestException("Cannot buy your own listing");
    }

    const idempotencyKey = `asset-buy:${listing.id}:${buyer.id}`;
    await this.economy.debitCharacter(
      buyer.id,
      listing.priceCents,
      "asset_purchase",
      idempotencyKey,
      { listingId: listing.id, assetKey: listing.assetKey },
    );

    if (listing.sellerCharacterId) {
      await this.economy.creditCharacter(
        listing.sellerCharacterId,
        listing.priceCents,
        "asset_sale",
        `${idempotencyKey}:seller`,
        { listingId: listing.id, buyerCharacterId: buyer.id },
      );
    } else {
      await this.economy.creditSystemTreasury(
        listing.priceCents,
        "world_government_asset_sale",
        `${idempotencyKey}:treasury`,
        { listingId: listing.id, buyerCharacterId: buyer.id },
      );
    }

    const [owned] = await db
      .insert(characterAssets)
      .values({
        characterId: buyer.id,
        assetKey: listing.assetKey,
        title: listing.title,
        estimatedValueCents: listing.baseValueCents || listing.priceCents,
        quantity: 1,
        metadata: listing.metadata ?? {},
        acquiredHow: "purchase",
      })
      .returning();

    await db
      .update(assetListings)
      .set({ open: false })
      .where(eq(assetListings.id, listing.id));

    await this.events.emit({
      type: WorldEventType.AssetPurchased,
      payload: {
        listingId: listing.id,
        assetId: owned?.id,
        assetKey: listing.assetKey,
        priceCents: listing.priceCents,
        category: listing.category,
      },
      actorCharacterId: buyer.id,
      subjectType: "asset",
      subjectId: owned?.id,
    });

    return {
      assetId: owned?.id,
      title: listing.title,
      category: listing.category,
      priceCents: listing.priceCents,
    };
  }
}
