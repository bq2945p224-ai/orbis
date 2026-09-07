import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  bankAccounts,
  characters,
  cities,
  countries,
  districts,
  employments,
  employers,
  regions,
  travelTrips,
  and,
  eq,
  isNull,
} from "@orbis/db";
import { DbService } from "../core/db.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";

@Injectable()
export class CharacterService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async getMe(account: AuthedAccount) {
    const db = this.dbService.db;
    const [character] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.accountId, account.id), eq(characters.status, "alive")))
      .limit(1);
    if (!character) return null;

    const [location] = character.locationDistrictId
      ? await db
          .select({
            districtId: districts.id,
            districtName: districts.name,
            cityName: cities.name,
            countryName: countries.name,
            countryCode: countries.code,
            countryId: countries.id,
          })
          .from(districts)
          .innerJoin(cities, eq(districts.cityId, cities.id))
          .innerJoin(regions, eq(cities.regionId, regions.id))
          .innerJoin(countries, eq(regions.countryId, countries.id))
          .where(eq(districts.id, character.locationDistrictId))
          .limit(1)
      : [null];

    const [wallet] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.characterId, character.id))
      .limit(1);

    const [job] = await db
      .select({
        id: employments.id,
        title: employments.title,
        salaryCentsPerDay: employments.salaryCentsPerDay,
        employerName: employers.name,
      })
      .from(employments)
      .innerJoin(employers, eq(employments.employerId, employers.id))
      .where(and(eq(employments.characterId, character.id), isNull(employments.endedAt)))
      .limit(1);

    const [trip] = await db
      .select()
      .from(travelTrips)
      .where(
        and(eq(travelTrips.characterId, character.id), eq(travelTrips.status, "in_transit")),
      )
      .limit(1);

    return {
      ...character,
      location: location ?? null,
      balanceCents: wallet?.balanceCents ?? 0,
      currency: wallet?.currency ?? "ORB",
      employment: job ?? null,
      travel: trip
        ? {
            id: trip.id,
            toDistrictId: trip.toDistrictId,
            arrivesAt: trip.arrivesAt,
            status: trip.status,
            mode: trip.mode,
            destinationLabel: trip.destinationLabel,
            distanceM: trip.distanceM,
          }
        : null,
    };
  }

  async getById(id: string) {
    const db = this.dbService.db;
    const [character] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
    if (!character) throw new NotFoundException("Character not found");
    return {
      id: character.id,
      name: character.name,
      status: character.status,
      locationDistrictId: character.locationDistrictId,
      createdAt: character.createdAt,
      diedAt: character.diedAt,
      causeOfDeath: character.causeOfDeath,
    };
  }

  /** Characters are created only during signup (AuthService.register). */
  async create() {
    throw new BadRequestException(
      "Characters are created only during signup. Each account may have one living character.",
    );
  }
}
