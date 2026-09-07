import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildings,
  cities,
  districts,
  landParcels,
  parcelListings,
  parcelOwnerships,
  propertyTransfers,
  and,
  eq,
  sql,
} from "@orbis/db";
import {
  buyParcelSchema,
  buildSchema,
  buildQuoteSchema,
  listParcelSchema,
  buyLandCellSchema,
  WorldEventType,
  baseCellPriceCents,
  cellAreaM2,
  cellCentroid,
  cellWkt,
  lngLatToCell,
  BUILDING_CATALOG,
  buildingQuote,
  type BuildingTypeKey,
} from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";
import { sampleTerrain } from "./terrain.js";

@Injectable()
export class PropertyService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  async listListings(_account: AuthedAccount) {
    const db = this.dbService.db;
    const result = await db.execute(sql`
      SELECT
        pl.id,
        pl.parcel_id as "parcelId",
        pl.seller_character_id as "sellerCharacterId",
        pl.price_cents as "priceCents",
        pl.created_at as "createdAt",
        lp.district_id as "districtId",
        d.name as "districtName",
        c.name as "cityName",
        lp.area_m2 as "areaM2",
        lp.land_type as "landType",
        lp.zoning as zoning,
        lp.label as label,
        ST_Y(ST_Centroid(lp.geom))::float8 as latitude,
        ST_X(ST_Centroid(lp.geom))::float8 as longitude
      FROM parcel_listings pl
      INNER JOIN land_parcels lp ON lp.id = pl.parcel_id
      INNER JOIN districts d ON d.id = lp.district_id
      INNER JOIN cities c ON c.id = d.city_id
      WHERE pl.open = true
      ORDER BY pl.created_at DESC
    `);

    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);

    return {
      listings: rows.map((row) => ({
        ...row,
        sellerName: row.sellerCharacterId ? "Player" : "World Government",
        sellerKind: row.sellerCharacterId ? "player" : "world_government",
      })),
    };
  }

  async buy(account: AuthedAccount, body: unknown) {
    const input = buyParcelSchema.parse(body);
    const db = this.dbService.db;
    const buyer = await requireLivingCharacter(db, account);

    const [listing] = await db
      .select()
      .from(parcelListings)
      .where(and(eq(parcelListings.id, input.listingId), eq(parcelListings.open, true)))
      .limit(1);
    if (!listing) throw new NotFoundException("Listing not found");

    if (listing.sellerCharacterId === buyer.id) {
      throw new BadRequestException("Cannot buy your own listing");
    }

    const priceCents = listing.priceCents;
    const idempotencyKey = `parcel-buy:${input.listingId}:${buyer.id}`;

    await this.economy.debitCharacter(
      buyer.id,
      priceCents,
      "parcel_purchase",
      idempotencyKey,
      { listingId: listing.id, parcelId: listing.parcelId },
    );

    if (listing.sellerCharacterId) {
      await this.economy.creditCharacter(
        listing.sellerCharacterId,
        priceCents,
        "parcel_sale",
        `${idempotencyKey}:seller`,
        { listingId: listing.id, parcelId: listing.parcelId, buyerCharacterId: buyer.id },
      );
    } else {
      await this.economy.creditSystemTreasury(
        priceCents,
        "world_government_land_sale",
        `${idempotencyKey}:treasury`,
        { listingId: listing.id, parcelId: listing.parcelId, buyerCharacterId: buyer.id },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(parcelListings)
        .set({ open: false })
        .where(eq(parcelListings.id, listing.id));

      await tx
        .insert(parcelOwnerships)
        .values({
          parcelId: listing.parcelId,
          ownerCharacterId: buyer.id,
          acquisition: "purchase",
        })
        .onConflictDoUpdate({
          target: parcelOwnerships.parcelId,
          set: {
            ownerCharacterId: buyer.id,
            acquiredAt: new Date(),
            acquisition: "purchase",
          },
        });

      await tx.insert(propertyTransfers).values({
        parcelId: listing.parcelId,
        fromCharacterId: listing.sellerCharacterId,
        toCharacterId: buyer.id,
        priceCents,
        reason: "purchase",
      });
    });

    await this.events.emit({
      type: WorldEventType.ParcelPurchased,
      payload: {
        listingId: listing.id,
        parcelId: listing.parcelId,
        buyerCharacterId: buyer.id,
        sellerCharacterId: listing.sellerCharacterId,
        priceCents,
      },
      actorCharacterId: buyer.id,
      subjectType: "parcel",
      subjectId: listing.parcelId,
    });

    return {
      parcelId: listing.parcelId,
      priceCents,
      listingId: listing.id,
    };
  }

  async list(account: AuthedAccount, body: unknown) {
    const input = listParcelSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [ownership] = await db
      .select()
      .from(parcelOwnerships)
      .where(eq(parcelOwnerships.parcelId, input.parcelId))
      .limit(1);
    if (!ownership || ownership.ownerCharacterId !== character.id) {
      throw new BadRequestException("You do not own this parcel");
    }

    const [existingOpen] = await db
      .select()
      .from(parcelListings)
      .where(and(eq(parcelListings.parcelId, input.parcelId), eq(parcelListings.open, true)))
      .limit(1);
    if (existingOpen) {
      throw new BadRequestException("Parcel already has an open listing");
    }

    const [listing] = await db
      .insert(parcelListings)
      .values({
        parcelId: input.parcelId,
        sellerCharacterId: character.id,
        priceCents: input.priceCents,
        open: true,
      })
      .returning();

    if (!listing) throw new BadRequestException("Could not create listing");

    return {
      listingId: listing.id,
      parcelId: listing.parcelId,
      priceCents: listing.priceCents,
    };
  }

  async mine(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const result = await db.execute(sql`
      SELECT
        po.parcel_id as "parcelId",
        po.acquired_at as "acquiredAt",
        po.acquisition as acquisition,
        lp.district_id as "districtId",
        d.name as "districtName",
        c.name as "cityName",
        lp.area_m2 as "areaM2",
        lp.land_type as "landType",
        lp.zoning as zoning,
        lp.label as label,
        ST_AsGeoJSON(lp.geom)::json as geometry,
        ST_Y(ST_Centroid(lp.geom))::float8 as latitude,
        ST_X(ST_Centroid(lp.geom))::float8 as longitude
      FROM parcel_ownerships po
      INNER JOIN land_parcels lp ON lp.id = po.parcel_id
      INNER JOIN districts d ON d.id = lp.district_id
      INNER JOIN cities c ON c.id = d.city_id
      WHERE po.owner_character_id = ${character.id}::uuid
      ORDER BY po.acquired_at DESC
    `);

    const parcels = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? []);

    return { characterId: character.id, parcels };
  }

  async buildQuote(account: AuthedAccount, body: unknown) {
    const input = buildQuoteSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [ownership] = await db
      .select()
      .from(parcelOwnerships)
      .where(eq(parcelOwnerships.parcelId, input.parcelId))
      .limit(1);
    if (!ownership || ownership.ownerCharacterId !== character.id) {
      throw new BadRequestException("You do not own this parcel");
    }

    const [parcel] = await db
      .select()
      .from(landParcels)
      .where(eq(landParcels.id, input.parcelId))
      .limit(1);
    if (!parcel) throw new NotFoundException("Parcel not found");

    let terrain = (parcel.terrain as "water" | "flat" | "hills" | "mountain" | "unknown") || "unknown";
    let elevationM = parcel.elevationM;
    if (terrain === "unknown" || elevationM == null) {
      const centroid = await db.execute(sql`
        SELECT ST_Y(ST_Centroid(geom))::float8 as lat, ST_X(ST_Centroid(geom))::float8 as lng
        FROM land_parcels WHERE id = ${input.parcelId}::uuid LIMIT 1
      `);
      const rows = (
        Array.isArray(centroid)
          ? centroid
          : ((centroid as { rows?: unknown[] }).rows ?? [])
      ) as Array<{ lat?: unknown; lng?: unknown }>;
      const c = rows[0];
      if (c && typeof c.lat === "number" && typeof c.lng === "number") {
        const sample = await sampleTerrain(c.lat, c.lng);
        terrain = sample.terrain;
        elevationM = sample.elevationM;
        await db
          .update(landParcels)
          .set({ terrain, elevationM: elevationM ?? undefined })
          .where(eq(landParcels.id, input.parcelId));
      }
    }

    const catalog = BUILDING_CATALOG[input.buildingType as BuildingTypeKey];
    const quote = buildingQuote(input.buildingType as BuildingTypeKey, terrain);
    const areaOk = parcel.areaM2 >= catalog.minAreaM2;

    return {
      parcelId: input.parcelId,
      buildingType: input.buildingType,
      catalog,
      terrain,
      elevationM,
      areaM2: parcel.areaM2,
      minAreaM2: catalog.minAreaM2,
      areaOk,
      ...quote,
      allowed: quote.allowed && areaOk,
      reason: !areaOk
        ? `Needs at least ${catalog.minAreaM2.toLocaleString()} m² (parcel has ${parcel.areaM2.toLocaleString()} m²).`
        : quote.reason,
    };
  }

  async build(account: AuthedAccount, body: unknown) {
    const input = buildSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [ownership] = await db
      .select()
      .from(parcelOwnerships)
      .where(eq(parcelOwnerships.parcelId, input.parcelId))
      .limit(1);
    if (!ownership || ownership.ownerCharacterId !== character.id) {
      throw new BadRequestException("You do not own this parcel");
    }

    const quote = await this.buildQuote(account, {
      parcelId: input.parcelId,
      buildingType: input.buildingType,
    });
    if (!quote.allowed) {
      throw new BadRequestException(quote.reason ?? "Cannot build here");
    }

    const costCents = quote.costCents;
    const idempotencyKey = `build:${input.parcelId}:${input.buildingType}:${character.id}:${Date.now()}`;
    await this.economy.debitCharacter(
      character.id,
      costCents,
      "construction",
      idempotencyKey,
      {
        parcelId: input.parcelId,
        name: input.name,
        buildingType: input.buildingType,
        terrain: quote.terrain,
        multiplier: quote.multiplier,
      },
    );

    const [place] = await db
      .select({
        districtName: districts.name,
        cityName: cities.name,
      })
      .from(landParcels)
      .leftJoin(districts, eq(landParcels.districtId, districts.id))
      .leftJoin(cities, eq(landParcels.cityId, cities.id))
      .where(eq(landParcels.id, input.parcelId))
      .limit(1);

    const address = [input.name, place?.districtName, place?.cityName].filter(Boolean).join(", ");

    const [building] = await db
      .insert(buildings)
      .values({
        parcelId: input.parcelId,
        name: input.name,
        buildingType: input.buildingType,
        address,
      })
      .returning();

    if (!building) throw new BadRequestException("Could not create building");

    await this.events.emit({
      type: WorldEventType.BuildingConstructed,
      payload: {
        buildingId: building.id,
        parcelId: input.parcelId,
        name: input.name,
        buildingType: input.buildingType,
        costCents,
        terrain: quote.terrain,
      },
      actorCharacterId: character.id,
      subjectType: "building",
      subjectId: building.id,
    });

    return {
      buildingId: building.id,
      parcelId: building.parcelId,
      name: building.name,
      buildingType: building.buildingType,
      costCents,
      terrain: quote.terrain,
      elevationM: quote.elevationM,
    };
  }

  buildingCatalog() {
    return { buildings: Object.values(BUILDING_CATALOG) };
  }

  /** Preview a World Government claim cell (1–1000 m). */
  async previewCell(account: AuthedAccount, body: unknown) {
    const input = buyLandCellSchema.parse(body);
    await requireLivingCharacter(this.dbService.db, account);
    const resolved = this.resolveCell(input);
    return this.cellDetails(resolved.ix, resolved.iy, resolved.cellSizeM);
  }

  /** Buy unowned land from the World Government by grid cell (lazy-create parcel). */
  async buyCell(account: AuthedAccount, body: unknown) {
    const input = buyLandCellSchema.parse(body);
    const db = this.dbService.db;
    const buyer = await requireLivingCharacter(db, account);
    const { ix, iy, cellSizeM } = this.resolveCell(input);
    const details = await this.cellDetails(ix, iy, cellSizeM);

    if (details.status === "owned") {
      throw new BadRequestException("This land is already owned");
    }
    if (details.terrain === "water") {
      throw new BadRequestException("Cannot claim open water as land.");
    }

    const areaM2 = cellAreaM2(cellSizeM);
    const priceCents = details.priceCents;
    const idempotencyKey = `land-cell-buy:${ix}:${iy}:${cellSizeM}:${buyer.id}`;
    const wkt = cellWkt(ix, iy, cellSizeM);
    const centroid = cellCentroid(ix, iy, cellSizeM);

    await this.economy.debitCharacter(buyer.id, priceCents, "land_cell_purchase", idempotencyKey, {
      ix,
      iy,
      cellSizeM,
      areaM2,
    });

    await this.economy.creditSystemTreasury(
      priceCents,
      "world_government_land_sale",
      `${idempotencyKey}:treasury`,
      { ix, iy, cellSizeM, buyerCharacterId: buyer.id },
    );

    const parcelId = await db.transaction(async (tx) => {
      const overlap = await tx.execute(sql`
        SELECT lp.id
        FROM land_parcels lp
        INNER JOIN parcel_ownerships po ON po.parcel_id = lp.id
        WHERE po.owner_character_id IS NOT NULL
          AND ST_Intersects(lp.geom, ST_GeomFromText(${wkt}, 4326))
        LIMIT 1
      `);
      const orows = Array.isArray(overlap)
        ? overlap
        : ((overlap as { rows?: unknown[] }).rows ?? []);
      if (orows.length > 0) {
        throw new BadRequestException("This area overlaps land someone already owns");
      }

      const existing = await tx.execute(sql`
        SELECT
          lp.id as id,
          po.owner_character_id as "ownerCharacterId"
        FROM land_parcels lp
        LEFT JOIN parcel_ownerships po ON po.parcel_id = lp.id
        WHERE lp.grid_ix = ${ix} AND lp.grid_iy = ${iy} AND lp.grid_size_m = ${cellSizeM}
        LIMIT 1
      `);
      const erows = Array.isArray(existing)
        ? existing
        : ((existing as { rows?: Array<{ id: string; ownerCharacterId: string | null }> }).rows ??
          []);
      let id = erows[0]?.id as string | undefined;
      if (id && erows[0]?.ownerCharacterId) {
        throw new BadRequestException("This land is already owned");
      }

      if (!id) {
        const landType = details.terrain === "mountain" ? "mountain" : "wild";
        const inserted = await tx.execute(sql`
          INSERT INTO land_parcels (
            geom, area_m2, land_type, zoning, label, grid_ix, grid_iy, grid_size_m,
            elevation_m, terrain, origin
          ) VALUES (
            ST_GeomFromText(${wkt}, 4326),
            ${areaM2},
            ${landType},
            'mixed',
            ${`${cellSizeM}m cell ${ix},${iy}`},
            ${ix},
            ${iy},
            ${cellSizeM},
            ${details.elevationM},
            ${details.terrain},
            'grid'
          )
          RETURNING id
        `);
        const rows = Array.isArray(inserted)
          ? inserted
          : ((inserted as { rows?: { id: string }[] }).rows ?? []);
        id = (rows[0] as { id?: string } | undefined)?.id;
        if (!id) throw new BadRequestException("Could not create land cell");
      }

      await tx
        .insert(parcelOwnerships)
        .values({
          parcelId: id,
          ownerCharacterId: buyer.id,
          acquisition: "purchase",
        })
        .onConflictDoUpdate({
          target: parcelOwnerships.parcelId,
          set: {
            ownerCharacterId: buyer.id,
            acquiredAt: new Date(),
            acquisition: "purchase",
          },
        });

      await tx.insert(propertyTransfers).values({
        parcelId: id,
        fromCharacterId: null,
        toCharacterId: buyer.id,
        priceCents,
        reason: "wg_grid_purchase",
      });

      return id;
    });

    await this.events.emit({
      type: WorldEventType.LandCellPurchased,
      payload: {
        parcelId,
        ix,
        iy,
        cellSizeM,
        priceCents,
        areaM2,
        terrain: details.terrain,
        resources: details.resources,
      },
      actorCharacterId: buyer.id,
      subjectType: "parcel",
      subjectId: parcelId,
    });

    return {
      parcelId,
      ix,
      iy,
      priceCents,
      areaM2,
      cellSizeM,
      terrain: details.terrain,
      elevationM: details.elevationM,
      latitude: centroid.lat,
      longitude: centroid.lng,
      resources: details.resources,
    };
  }

  private resolveCell(input: {
    ix?: number;
    iy?: number;
    lng?: number;
    lat?: number;
    cellSizeM?: number;
  }): { ix: number; iy: number; cellSizeM: number } {
    const cellSizeM = input.cellSizeM ?? 100;
    if (typeof input.ix === "number" && typeof input.iy === "number") {
      return { ix: input.ix, iy: input.iy, cellSizeM };
    }
    if (typeof input.lng === "number" && typeof input.lat === "number") {
      const cell = lngLatToCell(input.lng, input.lat, cellSizeM);
      return { ...cell, cellSizeM };
    }
    throw new BadRequestException("Provide ix+iy or lng+lat");
  }

  private async cellDetails(ix: number, iy: number, cellSizeM: number) {
    const db = this.dbService.db;
    const centroid = cellCentroid(ix, iy, cellSizeM);
    const areaM2 = cellAreaM2(cellSizeM);
    const wkt = cellWkt(ix, iy, cellSizeM);

    const owned = await db.execute(sql`
      SELECT
        lp.id as "parcelId",
        po.owner_character_id as "ownerCharacterId"
      FROM land_parcels lp
      LEFT JOIN parcel_ownerships po ON po.parcel_id = lp.id
      WHERE (
        (lp.grid_ix = ${ix} AND lp.grid_iy = ${iy} AND lp.grid_size_m = ${cellSizeM})
        OR (
          po.owner_character_id IS NOT NULL
          AND ST_Intersects(lp.geom, ST_GeomFromText(${wkt}, 4326))
        )
      )
      LIMIT 1
    `);
    const ownedRows = Array.isArray(owned)
      ? owned
      : ((owned as { rows?: Array<Record<string, unknown>> }).rows ?? []);
    const ownedRow = ownedRows[0] as
      | { parcelId?: string; ownerCharacterId?: string | null }
      | undefined;

    const sample = await sampleTerrain(centroid.lat, centroid.lng);
    const resources = await this.resourcesNearPoint(centroid.lng, centroid.lat);
    const richnessTotal = resources.reduce((sum, r) => sum + r.richness, 0);
    const priceCents = baseCellPriceCents(areaM2, richnessTotal);

    return {
      ix,
      iy,
      areaM2,
      cellSizeM,
      latitude: centroid.lat,
      longitude: centroid.lng,
      status: ownedRow?.ownerCharacterId ? ("owned" as const) : ("available" as const),
      parcelId: ownedRow?.parcelId ?? null,
      priceCents,
      seller: "World Government",
      terrain: sample.terrain,
      elevationM: sample.elevationM,
      resources,
    };
  }

  private async resourcesNearPoint(lng: number, lat: number) {
    const db = this.dbService.db;
    const result = await db.execute(sql`
      SELECT
        rd.resource_key as "resourceKey",
        def.name as "resourceName",
        def.unit as unit,
        rd.richness::float8 as richness,
        rd.radius_m as "radiusM",
        rd.remaining_units as "remainingUnits",
        rd.label as label,
        def.heatmap_color as "heatmapColor"
      FROM resource_deposits rd
      INNER JOIN resource_definitions def ON def.key = rd.resource_key
      WHERE ST_DWithin(
        rd.geom::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        rd.radius_m
      )
      ORDER BY rd.richness DESC
      LIMIT 20
    `);
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? []);
    return rows as Array<{
      resourceKey: string;
      resourceName: string;
      unit: string;
      richness: number;
      radiusM: number;
      remainingUnits: number;
      label: string | null;
      heatmapColor: string;
    }>;
  }
}
