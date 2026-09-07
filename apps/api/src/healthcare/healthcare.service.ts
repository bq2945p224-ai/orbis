import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  characterHealth,
  cities,
  districts,
  inventories,
  treatments,
  and,
  eq,
  sql,
} from "@orbis/db";
import {
  treatSchema,
  consumeSupplySchema,
  buySupplySchema,
  forageSchema,
  SUPPLY_PRICES_CENTS,
  FOOD_RESTORE,
  WATER_RESTORE,
  FOOD_ENERGY_BONUS,
  WorldEventType,
} from "@orbis/contracts";
import { randomUUID } from "node:crypto";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

const CLINIC_COST_CENTS = 5_000;
const VACCINE_COST_CENTS = 8_000;
const DEFAULT_PATHOGEN_KEY = "orbis_flu";
const OWNER_TYPE_CHARACTER = "character";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

@Injectable()
export class HealthcareService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  async ensureHealth(characterId: string) {
    const db = this.dbService.db;
    const [health] = await db
      .insert(characterHealth)
      .values({ characterId })
      .onConflictDoNothing()
      .returning();

    if (health) return health;

    const [existing] = await db
      .select()
      .from(characterHealth)
      .where(eq(characterHealth.characterId, characterId))
      .limit(1);
    return existing!;
  }

  private async inventoryQty(characterId: string, itemKey: string) {
    const db = this.dbService.db;
    const [row] = await db
      .select()
      .from(inventories)
      .where(
        and(
          eq(inventories.ownerType, OWNER_TYPE_CHARACTER),
          eq(inventories.ownerId, characterId),
          eq(inventories.itemKey, itemKey),
        ),
      )
      .limit(1);
    return row?.quantity ?? 0;
  }

  private async localEnvironment(character: {
    locationDistrictId: string | null;
    latitude: number | null;
    longitude: number | null;
  }) {
    const db = this.dbService.db;
    let biome = "temperate";
    let hasMarket = false;
    let districtName: string | null = null;
    let cityName: string | null = null;

    if (character.locationDistrictId) {
      const [row] = await db
        .select({
          biome: cities.biome,
          hasMarket: districts.hasMarket,
          districtName: districts.name,
          cityName: cities.name,
        })
        .from(districts)
        .innerJoin(cities, eq(districts.cityId, cities.id))
        .where(eq(districts.id, character.locationDistrictId))
        .limit(1);
      if (row) {
        biome = row.biome;
        hasMarket = row.hasMarket;
        districtName = row.districtName;
        cityName = row.cityName;
      }
    }

    const lat = character.latitude;
    const lng = character.longitude;
    let nearFertileSoil = false;
    if (typeof lat === "number" && typeof lng === "number") {
      const result = await db.execute(sql`
        SELECT 1 as ok
        FROM resource_deposits
        WHERE resource_key = 'fertile_soil'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            radius_m
          )
        LIMIT 1
      `);
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] }).rows ?? []);
      nearFertileSoil = rows.length > 0;
    }

    const isDesert = biome === "desert";
    const isArctic = biome === "arctic";

    // Urban/market districts sell supplies; deserts and remote outposts do not.
    const canBuyFood = hasMarket && !isDesert;
    const canBuyWater = hasMarket && !isDesert;
    // Forage food where soil supports it (or mild biomes); deserts have none.
    const canForageFood =
      !isDesert && (nearFertileSoil || ["temperate", "mediterranean", "tropical"].includes(biome));
    // Fresh water forage fails in deserts; arctic melt is scarce for now.
    const canForageWater = !isDesert && !isArctic;

    return {
      biome,
      districtName,
      cityName,
      hasMarket,
      nearFertileSoil,
      canBuyFood,
      canBuyWater,
      canForageFood,
      canForageWater,
      note: isDesert
        ? "Desert: no local food or water markets. Bring rations or leave."
        : hasMarket
          ? "Local market sells food and water."
          : "No market here — forage if the land allows, or travel elsewhere.",
    };
  }

  async getMe(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const health = await this.ensureHealth(character.id);
    const environment = await this.localEnvironment(character);
    const food = await this.inventoryQty(character.id, "food");
    const water = await this.inventoryQty(character.id, "water");

    return {
      ...health,
      characterId: character.id,
      supplies: { food, water },
      prices: SUPPLY_PRICES_CENTS,
      environment,
    };
  }

  async treat(account: AuthedAccount, body: unknown) {
    const input = treatSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    await this.ensureHealth(character.id);

    const costCents = input.kind === "clinic" ? CLINIC_COST_CENTS : VACCINE_COST_CENTS;
    const idempotencyKey = `treat:${character.id}:${input.kind}:${Date.now()}`;

    await this.economy.debitCharacter(
      character.id,
      costCents,
      input.kind === "clinic" ? "clinic_treatment" : "vaccination",
      idempotencyKey,
      { kind: input.kind },
    );

    const updates =
      input.kind === "clinic"
        ? {
            hp: 100,
            infectedPathogenKey: null,
            infectedAt: null,
            updatedAt: new Date(),
          }
        : {
            vaccinatedPathogenKey: DEFAULT_PATHOGEN_KEY,
            updatedAt: new Date(),
          };

    const [health] = await db
      .update(characterHealth)
      .set(updates)
      .where(eq(characterHealth.characterId, character.id))
      .returning();

    await db.insert(treatments).values({
      characterId: character.id,
      kind: input.kind,
      costCents,
    });

    await this.events.emit({
      type: WorldEventType.Treated,
      payload: { kind: input.kind, costCents },
      actorCharacterId: character.id,
      subjectType: "character_health",
      subjectId: character.id,
    });

    return {
      characterId: character.id,
      kind: input.kind,
      costCents,
      health,
    };
  }

  async consume(account: AuthedAccount, body: unknown) {
    const input = consumeSupplySchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const health = await this.ensureHealth(character.id);

    const [inv] = await db
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
    if (!inv || inv.quantity < input.quantity) {
      throw new BadRequestException(`Not enough ${input.itemKey} in inventory`);
    }

    await db
      .update(inventories)
      .set({ quantity: inv.quantity - input.quantity })
      .where(eq(inventories.id, inv.id));

    const hungerGain = input.itemKey === "food" ? FOOD_RESTORE * input.quantity : 0;
    const thirstGain = input.itemKey === "water" ? WATER_RESTORE * input.quantity : 0;
    const energyGain = input.itemKey === "food" ? FOOD_ENERGY_BONUS * input.quantity : 0;

    const [updated] = await db
      .update(characterHealth)
      .set({
        hunger: clamp(health.hunger + hungerGain, 0, health.maxHunger),
        thirst: clamp(health.thirst + thirstGain, 0, health.maxThirst),
        energy: clamp(health.energy + energyGain, 0, health.maxEnergy),
        updatedAt: new Date(),
      })
      .where(eq(characterHealth.characterId, character.id))
      .returning();

    await this.events.emit({
      type: WorldEventType.ConsumedSupply,
      payload: { itemKey: input.itemKey, quantity: input.quantity },
      actorCharacterId: character.id,
      subjectType: "character",
      subjectId: character.id,
    });

    return { health: updated, consumed: { itemKey: input.itemKey, quantity: input.quantity } };
  }

  async buySupplies(account: AuthedAccount, body: unknown) {
    const input = buySupplySchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const env = await this.localEnvironment(character);

    if (input.itemKey === "food" && !env.canBuyFood) {
      throw new BadRequestException(
        env.biome === "desert"
          ? "No food for sale in the desert — bring rations or leave."
          : "No food market at this location.",
      );
    }
    if (input.itemKey === "water" && !env.canBuyWater) {
      throw new BadRequestException(
        env.biome === "desert"
          ? "No water for sale in the desert — bring canteens or leave."
          : "No water market at this location.",
      );
    }

    const priceEach = SUPPLY_PRICES_CENTS[input.itemKey];
    const totalCents = priceEach * input.quantity;
    const idempotencyKey = `supply-buy:${character.id}:${input.itemKey}:${randomUUID()}`;

    await this.economy.debitCharacter(
      character.id,
      totalCents,
      "supply_purchase",
      idempotencyKey,
      { itemKey: input.itemKey, quantity: input.quantity },
    );
    await this.economy.creditSystemTreasury(
      totalCents,
      "world_government_supply_sale",
      `${idempotencyKey}:treasury`,
      { itemKey: input.itemKey, quantity: input.quantity },
    );

    await db
      .insert(inventories)
      .values({
        ownerType: OWNER_TYPE_CHARACTER,
        ownerId: character.id,
        itemKey: input.itemKey,
        quantity: input.quantity,
      })
      .onConflictDoUpdate({
        target: [inventories.ownerType, inventories.ownerId, inventories.itemKey],
        set: { quantity: sql`${inventories.quantity} + ${input.quantity}` },
      });

    return {
      itemKey: input.itemKey,
      quantity: input.quantity,
      totalCents,
      supplies: {
        food: await this.inventoryQty(character.id, "food"),
        water: await this.inventoryQty(character.id, "water"),
      },
    };
  }

  async forage(account: AuthedAccount, body: unknown) {
    const input = forageSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const health = await this.ensureHealth(character.id);
    const env = await this.localEnvironment(character);

    if (input.kind === "food" && !env.canForageFood) {
      throw new BadRequestException(
        env.biome === "desert"
          ? "Nothing edible grows here."
          : "No forageable food at this location.",
      );
    }
    if (input.kind === "water" && !env.canForageWater) {
      throw new BadRequestException(
        env.biome === "desert" ? "No fresh water here." : "No forageable water here.",
      );
    }
    if (health.energy < 15) {
      throw new BadRequestException("Too exhausted to forage — rest or eat first.");
    }

    const qty = 1;
    await db
      .insert(inventories)
      .values({
        ownerType: OWNER_TYPE_CHARACTER,
        ownerId: character.id,
        itemKey: input.kind,
        quantity: qty,
      })
      .onConflictDoUpdate({
        target: [inventories.ownerType, inventories.ownerId, inventories.itemKey],
        set: { quantity: sql`${inventories.quantity} + ${qty}` },
      });

    const [updated] = await db
      .update(characterHealth)
      .set({
        energy: clamp(health.energy - 15, 0, health.maxEnergy),
        updatedAt: new Date(),
      })
      .where(eq(characterHealth.characterId, character.id))
      .returning();

    await this.events.emit({
      type: WorldEventType.Foraged,
      payload: { kind: input.kind, quantity: qty, biome: env.biome },
      actorCharacterId: character.id,
      subjectType: "character",
      subjectId: character.id,
    });

    return {
      kind: input.kind,
      quantity: qty,
      health: updated,
      supplies: {
        food: await this.inventoryQty(character.id, "food"),
        water: await this.inventoryQty(character.id, "water"),
      },
    };
  }
}
