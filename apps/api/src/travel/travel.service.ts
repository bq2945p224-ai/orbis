import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assetDefinitions,
  characterAssets,
  cities,
  countries,
  districts,
  regions,
  travelTrips,
  worldClock,
  and,
  eq,
  sql,
} from "@orbis/db";
import {
  travelSchema,
  travelQuoteSchema,
  quoteGroundTravel,
  formatTravelDuration,
  WorldEventType,
} from "@orbis/contracts";
import { randomUUID } from "node:crypto";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class TravelService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  private async locationRow(districtId: string) {
    const db = this.dbService.db;
    const [row] = await db
      .select({
        districtId: districts.id,
        districtName: districts.name,
        cityId: cities.id,
        cityName: cities.name,
        cityLat: cities.latitude,
        cityLng: cities.longitude,
        regionId: regions.id,
        regionName: regions.name,
        countryId: countries.id,
        countryName: countries.name,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .innerJoin(regions, eq(cities.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(districts.id, districtId))
      .limit(1);
    if (!row) throw new NotFoundException("District not found");
    return row;
  }

  private async resolvePosition(character: {
    id: string;
    locationDistrictId: string | null;
    latitude: number | null;
    longitude: number | null;
  }) {
    if (
      typeof character.latitude === "number" &&
      typeof character.longitude === "number" &&
      Number.isFinite(character.latitude) &&
      Number.isFinite(character.longitude)
    ) {
      return { lat: character.latitude, lng: character.longitude };
    }
    if (!character.locationDistrictId) {
      throw new BadRequestException("Character has no location");
    }
    const loc = await this.locationRow(character.locationDistrictId);
    return { lat: loc.cityLat, lng: loc.cityLng };
  }

  private async hasVehicle(characterId: string) {
    const db = this.dbService.db;
    const [row] = await db
      .select({ id: characterAssets.id })
      .from(characterAssets)
      .innerJoin(assetDefinitions, eq(characterAssets.assetKey, assetDefinitions.key))
      .where(
        and(eq(characterAssets.characterId, characterId), eq(assetDefinitions.category, "vehicle")),
      )
      .limit(1);
    return Boolean(row);
  }

  private async nearestDistrictId(lat: number, lng: number) {
    const db = this.dbService.db;
    const result = await db.execute(sql`
      SELECT d.id as id
      FROM districts d
      INNER JOIN cities c ON c.id = d.city_id
      ORDER BY
        (c.latitude - ${lat}) * (c.latitude - ${lat})
        + (c.longitude - ${lng}) * (c.longitude - ${lng})
      ASC
      LIMIT 1
    `);
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
    const id = rows[0]?.id;
    if (!id) throw new BadRequestException("No districts available");
    return id as string;
  }

  private async resolveDestination(input: {
    toLat?: number;
    toLng?: number;
    toBuildingId?: string;
    toDistrictId?: string;
    destinationLabel?: string;
  }) {
    const db = this.dbService.db;

    if (input.toBuildingId) {
      const result = await db.execute(sql`
        SELECT
          b.id as id,
          b.name as name,
          b.address as address,
          lp.district_id as "districtId",
          ST_Y(ST_Centroid(lp.geom))::float8 as lat,
          ST_X(ST_Centroid(lp.geom))::float8 as lng
        FROM buildings b
        INNER JOIN land_parcels lp ON lp.id = b.parcel_id
        WHERE b.id = ${input.toBuildingId}::uuid
        LIMIT 1
      `);
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
      const row = rows[0] as
        | {
            id: string;
            name: string;
            address: string | null;
            districtId: string | null;
            lat: number;
            lng: number;
          }
        | undefined;
      if (!row) throw new NotFoundException("Building not found");
      const districtId = row.districtId ?? (await this.nearestDistrictId(row.lat, row.lng));
      return {
        lat: row.lat,
        lng: row.lng,
        districtId,
        buildingId: row.id,
        label: row.address || row.name,
      };
    }

    if (typeof input.toLat === "number" && typeof input.toLng === "number") {
      const districtId = await this.nearestDistrictId(input.toLat, input.toLng);
      return {
        lat: input.toLat,
        lng: input.toLng,
        districtId,
        buildingId: null as string | null,
        label:
          input.destinationLabel?.trim() ||
          `${input.toLat.toFixed(5)}, ${input.toLng.toFixed(5)}`,
      };
    }

    if (input.toDistrictId) {
      const loc = await this.locationRow(input.toDistrictId);
      return {
        lat: loc.cityLat,
        lng: loc.cityLng,
        districtId: loc.districtId,
        buildingId: null as string | null,
        label: `${loc.districtName}, ${loc.cityName}`,
      };
    }

    throw new BadRequestException("Invalid destination");
  }

  async status(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const [trip] = await db
      .select()
      .from(travelTrips)
      .where(
        and(eq(travelTrips.characterId, character.id), eq(travelTrips.status, "in_transit")),
      )
      .limit(1);

    const location = character.locationDistrictId
      ? await this.locationRow(character.locationDistrictId)
      : null;
    const position = await this.resolvePosition(character).catch(() => null);
    const hasVehicle = await this.hasVehicle(character.id);

    return {
      characterId: character.id,
      hasVehicle,
      position,
      location,
      trip: trip
        ? {
            id: trip.id,
            fromDistrictId: trip.fromDistrictId,
            toDistrictId: trip.toDistrictId,
            costCents: trip.costCents,
            departedAt: trip.departedAt,
            arrivesAt: trip.arrivesAt,
            status: trip.status,
            mode: trip.mode,
            distanceM: trip.distanceM,
            destinationLabel: trip.destinationLabel,
            fromLat: trip.fromLat,
            fromLng: trip.fromLng,
            toLat: trip.toLat,
            toLng: trip.toLng,
            durationLabel: formatTravelDuration(
              Math.max(0, new Date(trip.arrivesAt).getTime() - new Date(trip.departedAt).getTime()),
            ),
          }
        : null,
    };
  }

  async quote(account: AuthedAccount, body: unknown) {
    const input = travelQuoteSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const from = await this.resolvePosition(character);
    const dest = await this.resolveDestination(input);
    const hasVehicle = await this.hasVehicle(character.id);
    const quote = quoteGroundTravel({
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: dest.lat,
      toLng: dest.lng,
      hasVehicle,
    });

    return {
      ...quote,
      hasVehicle,
      from,
      to: dest,
      durationLabel: formatTravelDuration(quote.durationMs),
      note: hasVehicle
        ? "You own a vehicle — travel time uses average driving speed."
        : "No vehicle — you will walk at real-life walking speed. Buy a car under Assets to drive.",
    };
  }

  async searchAddresses(account: AuthedAccount, q: string) {
    await requireLivingCharacter(this.dbService.db, account);
    const query = `%${q.trim()}%`;
    if (q.trim().length < 2) return { hits: [] };

    const result = await this.dbService.db.execute(sql`
      SELECT
        b.id as id,
        b.name as name,
        b.address as address,
        b.building_type as "buildingType",
        ST_Y(ST_Centroid(lp.geom))::float8 as latitude,
        ST_X(ST_Centroid(lp.geom))::float8 as longitude,
        d.name as "districtName",
        c.name as "cityName"
      FROM buildings b
      INNER JOIN land_parcels lp ON lp.id = b.parcel_id
      LEFT JOIN districts d ON d.id = lp.district_id
      LEFT JOIN cities c ON c.id = lp.city_id
      WHERE b.address ILIKE ${query}
         OR b.name ILIKE ${query}
      ORDER BY b.name
      LIMIT 20
    `);
    const hits = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? []);
    return { hits };
  }

  /** Kept for older clients — district list with ground quotes from current position. */
  async destinations(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const fromPos = await this.resolvePosition(character);
    const hasVehicle = await this.hasVehicle(character.id);
    const from = character.locationDistrictId
      ? await this.locationRow(character.locationDistrictId)
      : null;

    const all = await db
      .select({
        districtId: districts.id,
        districtName: districts.name,
        cityId: cities.id,
        cityName: cities.name,
        cityLat: cities.latitude,
        cityLng: cities.longitude,
        regionId: regions.id,
        regionName: regions.name,
        countryId: countries.id,
        countryName: countries.name,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .innerJoin(regions, eq(cities.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id));

    return {
      from,
      hasVehicle,
      destinations: all
        .filter((d) => d.districtId !== from?.districtId)
        .map((d) => {
          const quote = quoteGroundTravel({
            fromLat: fromPos.lat,
            fromLng: fromPos.lng,
            toLat: d.cityLat,
            toLng: d.cityLng,
            hasVehicle,
          });
          return {
            ...d,
            ...quote,
            durationMinutes: Math.round(quote.durationMs / 60_000),
            durationLabel: formatTravelDuration(quote.durationMs),
            label: quote.mode === "drive" ? "drive" : "walk",
          };
        }),
    };
  }

  async start(account: AuthedAccount, body: unknown) {
    const input = travelSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    if (!character.locationDistrictId) {
      throw new BadRequestException("Character has no location");
    }

    const [activeTrip] = await db
      .select()
      .from(travelTrips)
      .where(
        and(eq(travelTrips.characterId, character.id), eq(travelTrips.status, "in_transit")),
      )
      .limit(1);
    if (activeTrip) throw new BadRequestException("Already traveling");

    const fromPos = await this.resolvePosition(character);
    const dest = await this.resolveDestination(input);

    const sameSpot =
      Math.abs(fromPos.lat - dest.lat) < 1e-5 && Math.abs(fromPos.lng - dest.lng) < 1e-5;
    if (sameSpot) throw new BadRequestException("Already at that destination");

    const hasVehicle = await this.hasVehicle(character.id);
    const quote = quoteGroundTravel({
      fromLat: fromPos.lat,
      fromLng: fromPos.lng,
      toLat: dest.lat,
      toLng: dest.lng,
      hasVehicle,
    });

    const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    const simNow = clock?.simTime ?? new Date();
    const arrivesAt = new Date(simNow.getTime() + quote.durationMs);

    if (quote.costCents > 0) {
      await this.economy.debitCharacter(
        character.id,
        quote.costCents,
        "travel_fuel",
        `travel:${character.id}:${dest.lat}:${dest.lng}:${randomUUID()}`,
        {
          mode: quote.mode,
          distanceM: quote.distanceM,
          toDistrictId: dest.districtId,
        },
      );
    }

    const [trip] = await db
      .insert(travelTrips)
      .values({
        characterId: character.id,
        fromDistrictId: character.locationDistrictId,
        toDistrictId: dest.districtId,
        costCents: quote.costCents,
        departedAt: simNow,
        arrivesAt,
        status: "in_transit",
        mode: quote.mode,
        fromLat: fromPos.lat,
        fromLng: fromPos.lng,
        toLat: dest.lat,
        toLng: dest.lng,
        distanceM: quote.distanceM,
        destinationLabel: dest.label,
        toBuildingId: dest.buildingId,
      })
      .returning();

    if (!trip) throw new BadRequestException("Could not start travel");

    await this.events.emit({
      type: WorldEventType.TravelStarted,
      payload: {
        tripId: trip.id,
        mode: quote.mode,
        distanceM: quote.distanceM,
        durationMs: quote.durationMs,
        costCents: quote.costCents,
        fromLat: fromPos.lat,
        fromLng: fromPos.lng,
        toLat: dest.lat,
        toLng: dest.lng,
        destinationLabel: dest.label,
        arrivesAt: arrivesAt.toISOString(),
      },
      actorCharacterId: character.id,
      subjectType: "travel_trip",
      subjectId: trip.id,
    });

    return {
      tripId: trip.id,
      mode: quote.mode,
      hasVehicle,
      distanceM: quote.distanceM,
      costCents: quote.costCents,
      speedKmh: quote.speedKmh,
      durationLabel: formatTravelDuration(quote.durationMs),
      destinationLabel: dest.label,
      departedAt: trip.departedAt,
      arrivesAt: trip.arrivesAt,
      from: fromPos,
      to: { lat: dest.lat, lng: dest.lng, districtId: dest.districtId },
    };
  }
}
