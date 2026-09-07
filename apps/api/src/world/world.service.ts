import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  characters,
  cities,
  countries,
  courtCases,
  crimes,
  districts,
  environmentMetrics,
  militaryUnits,
  npcs,
  pathogens,
  sanctions,
  treaties,
  wars,
  and,
  desc,
  eq,
} from "@orbis/db";
import { reportCrimeSchema, WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class WorldService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async listTreaties(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db.select().from(treaties).orderBy(desc(treaties.createdAt));
    return { treaties: rows };
  }

  async listSanctions(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: sanctions.id,
        fromCountryId: sanctions.fromCountryId,
        toCountryId: sanctions.toCountryId,
        reason: sanctions.reason,
        active: sanctions.active,
        createdAt: sanctions.createdAt,
      })
      .from(sanctions)
      .where(eq(sanctions.active, true))
      .orderBy(desc(sanctions.createdAt));
    return { sanctions: rows };
  }

  async listMilitary(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: militaryUnits.id,
        countryId: militaryUnits.countryId,
        countryName: countries.name,
        name: militaryUnits.name,
        districtId: militaryUnits.districtId,
        districtName: districts.name,
        strength: militaryUnits.strength,
        createdAt: militaryUnits.createdAt,
      })
      .from(militaryUnits)
      .innerJoin(countries, eq(militaryUnits.countryId, countries.id))
      .leftJoin(districts, eq(militaryUnits.districtId, districts.id))
      .orderBy(desc(militaryUnits.createdAt));
    return { units: rows };
  }

  async listWars(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: wars.id,
        aggressorCountryId: wars.aggressorCountryId,
        defenderCountryId: wars.defenderCountryId,
        status: wars.status,
        startedAt: wars.startedAt,
        endedAt: wars.endedAt,
      })
      .from(wars)
      .orderBy(desc(wars.startedAt));
    return { wars: rows };
  }

  async getEnvironment(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: environmentMetrics.id,
        districtId: environmentMetrics.districtId,
        districtName: districts.name,
        cityName: cities.name,
        pollution: environmentMetrics.pollution,
        measuredAt: environmentMetrics.measuredAt,
      })
      .from(environmentMetrics)
      .innerJoin(districts, eq(environmentMetrics.districtId, districts.id))
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .orderBy(desc(environmentMetrics.measuredAt))
      .limit(100);
    return { metrics: rows };
  }

  async listCrimes(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: crimes.id,
        accusedCharacterId: crimes.accusedCharacterId,
        accusedName: characters.name,
        kind: crimes.kind,
        districtId: crimes.districtId,
        districtName: districts.name,
        status: crimes.status,
        createdAt: crimes.createdAt,
      })
      .from(crimes)
      .innerJoin(characters, eq(crimes.accusedCharacterId, characters.id))
      .leftJoin(districts, eq(crimes.districtId, districts.id))
      .orderBy(desc(crimes.createdAt))
      .limit(100);
    return { crimes: rows };
  }

  async reportCrime(account: AuthedAccount, body: unknown) {
    const input = reportCrimeSchema.parse(body);
    const db = this.dbService.db;
    const reporter = await requireLivingCharacter(db, account);

    const [accused] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, input.accusedCharacterId), eq(characters.status, "alive")))
      .limit(1);
    if (!accused) throw new NotFoundException("Accused character not found");
    if (accused.id === reporter.id) {
      throw new BadRequestException("Cannot report yourself");
    }

    const [crime] = await db
      .insert(crimes)
      .values({
        accusedCharacterId: input.accusedCharacterId,
        kind: input.kind,
        districtId: reporter.locationDistrictId,
        status: "reported",
      })
      .returning();

    if (!crime) throw new BadRequestException("Could not report crime");

    await this.events.emit({
      type: WorldEventType.CrimeReported,
      payload: {
        crimeId: crime.id,
        accusedCharacterId: input.accusedCharacterId,
        kind: input.kind,
        reporterCharacterId: reporter.id,
      },
      actorCharacterId: reporter.id,
      subjectType: "crime",
      subjectId: crime.id,
    });

    return {
      crimeId: crime.id,
      accusedCharacterId: input.accusedCharacterId,
      kind: input.kind,
      status: crime.status,
    };
  }

  async listCourts(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: courtCases.id,
        crimeId: courtCases.crimeId,
        status: courtCases.status,
        verdict: courtCases.verdict,
        fineCents: courtCases.fineCents,
        createdAt: courtCases.createdAt,
        resolvedAt: courtCases.resolvedAt,
        crimeKind: crimes.kind,
        accusedCharacterId: crimes.accusedCharacterId,
        accusedName: characters.name,
      })
      .from(courtCases)
      .innerJoin(crimes, eq(courtCases.crimeId, crimes.id))
      .innerJoin(characters, eq(crimes.accusedCharacterId, characters.id))
      .orderBy(desc(courtCases.createdAt))
      .limit(100);
    return { cases: rows };
  }

  async listNpcs(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: npcs.id,
        name: npcs.name,
        role: npcs.role,
        districtId: npcs.districtId,
        districtName: districts.name,
        createdAt: npcs.createdAt,
      })
      .from(npcs)
      .leftJoin(districts, eq(npcs.districtId, districts.id))
      .orderBy(desc(npcs.createdAt))
      .limit(200);
    return { npcs: rows };
  }

  async listPathogens(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db.select().from(pathogens);
    return { pathogens: rows };
  }
}
