import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  characterCountryPresence,
  characterNationalIds,
  characterPassports,
  countries,
  worldClock,
  and,
  asc,
  eq,
  countryIdForDistrict,
  effectivePresenceMs,
  presenceDays,
  syncPresenceOnDistrictMove,
  DAY_MS,
} from "@orbis/db";
import { applyCitizenshipSchema, REAL_HOURS_PER_GAME_DAY, WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

function wgPassportNumber(characterId: string) {
  return `WG-${characterId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function nationalDocNumber(countryCode: string) {
  return `${countryCode}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  private async simNow() {
    const db = this.dbService.db;
    const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    return clock?.simTime ?? new Date();
  }

  /** Issue World Government passport if missing; start presence in spawn country. */
  async ensureWorldPassport(characterId: string, locationDistrictId: string | null) {
    const db = this.dbService.db;
    const [existing] = await db
      .select()
      .from(characterPassports)
      .where(eq(characterPassports.characterId, characterId))
      .limit(1);

    let passport = existing;
    if (!passport) {
      const [created] = await db
        .insert(characterPassports)
        .values({
          characterId,
          passportNumber: wgPassportNumber(characterId),
          status: "active",
        })
        .returning();
      passport = created!;
      await this.events.emit({
        type: WorldEventType.PassportIssued,
        payload: { passportNumber: passport.passportNumber, issuer: "world_government" },
        actorCharacterId: characterId,
        subjectType: "character_passport",
        subjectId: passport.id,
      });
    }

    const countryId = await countryIdForDistrict(db, locationDistrictId);
    if (countryId) {
      await syncPresenceOnDistrictMove(
        db,
        characterId,
        null,
        locationDistrictId,
        await this.simNow(),
      );
    }

    return passport;
  }

  async getMe(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    await this.ensureWorldPassport(character.id, character.locationDistrictId);

    const [passport] = await db
      .select()
      .from(characterPassports)
      .where(eq(characterPassports.characterId, character.id))
      .limit(1);

    const nationalIds = await db
      .select({
        id: characterNationalIds.id,
        documentNumber: characterNationalIds.documentNumber,
        status: characterNationalIds.status,
        issuedAt: characterNationalIds.issuedAt,
        countryId: countries.id,
        countryCode: countries.code,
        countryName: countries.name,
      })
      .from(characterNationalIds)
      .innerJoin(countries, eq(characterNationalIds.countryId, countries.id))
      .where(eq(characterNationalIds.characterId, character.id))
      .orderBy(asc(countries.name));

    const now = await this.simNow();
    const allCountries = await db.select().from(countries).orderBy(asc(countries.name));
    const presenceRows = await db
      .select()
      .from(characterCountryPresence)
      .where(eq(characterCountryPresence.characterId, character.id));
    const presenceByCountry = new Map(presenceRows.map((p) => [p.countryId, p]));
    const heldIds = new Set(nationalIds.map((n) => n.countryId));

    const currentCountryId = await countryIdForDistrict(db, character.locationDistrictId);

    const residency = allCountries.map((c) => {
      const row = presenceByCountry.get(c.id);
      const ms = row ? effectivePresenceMs(row, now) : 0;
      const days = presenceDays(ms);
      const required = c.citizenshipResidencyDays;
      const currentlyPresent = row?.currentlyPresent ?? false;
      const hasId = heldIds.has(c.id);
      const presenceOk = !c.citizenshipRequiresPresence || currentlyPresent;
      const residencyOk = days >= required;
      return {
        countryId: c.id,
        countryCode: c.code,
        countryName: c.name,
        residencyDaysRequired: required,
        requiresPresence: c.citizenshipRequiresPresence,
        daysPresent: days,
        hoursPresent: Math.floor(ms / (60 * 60 * 1000)),
        currentlyPresent,
        hasNationalId: hasId,
        eligible: !hasId && presenceOk && residencyOk,
        missing: hasId
          ? null
          : [
              !residencyOk
                ? `Need ${required} day${required === 1 ? "" : "s"} present (you have ${days})`
                : null,
              !presenceOk ? "Must be physically in the country to apply" : null,
            ].filter(Boolean),
      };
    });

    let locationCountry: { id: string; code: string; name: string } | null = null;
    if (currentCountryId) {
      const c = allCountries.find((x) => x.id === currentCountryId);
      if (c) locationCountry = { id: c.id, code: c.code, name: c.name };
    }

    return {
      characterId: character.id,
      characterName: character.name,
      locationCountry,
      timeScale: {
        realHoursPerGameDay: REAL_HOURS_PER_GAME_DAY,
        note: `1 game day = ${REAL_HOURS_PER_GAME_DAY} real hours`,
      },
      simTime: now.toISOString(),
      passport: passport
        ? {
            passportNumber: passport.passportNumber,
            issuedAt: passport.issuedAt,
            status: passport.status,
            issuer: "World Government",
          }
        : null,
      nationalIds: nationalIds.map((n) => ({
        id: n.id,
        documentNumber: n.documentNumber,
        status: n.status,
        issuedAt: n.issuedAt,
        nationality: n.countryName,
        countryCode: n.countryCode,
        countryId: n.countryId,
      })),
      residency,
      dayMs: DAY_MS,
    };
  }

  async applyCitizenship(account: AuthedAccount, body: unknown) {
    const input = applyCitizenshipSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    await this.ensureWorldPassport(character.id, character.locationDistrictId);

    const [country] = await db
      .select()
      .from(countries)
      .where(eq(countries.id, input.countryId))
      .limit(1);
    if (!country) throw new NotFoundException("Country not found");

    const [existing] = await db
      .select()
      .from(characterNationalIds)
      .where(
        and(
          eq(characterNationalIds.characterId, character.id),
          eq(characterNationalIds.countryId, country.id),
        ),
      )
      .limit(1);
    if (existing) throw new BadRequestException("You already hold a national ID for this country");

    const currentCountryId = await countryIdForDistrict(db, character.locationDistrictId);
    if (country.citizenshipRequiresPresence && currentCountryId !== country.id) {
      throw new BadRequestException(`You must be in ${country.name} to apply for citizenship`);
    }

    let [presence] = await db
      .select()
      .from(characterCountryPresence)
      .where(
        and(
          eq(characterCountryPresence.characterId, character.id),
          eq(characterCountryPresence.countryId, country.id),
        ),
      )
      .limit(1);

    const now = await this.simNow();

    if (currentCountryId === country.id) {
      if (!presence) {
        [presence] = await db
          .insert(characterCountryPresence)
          .values({
            characterId: character.id,
            countryId: country.id,
            firstEnteredAt: now,
            presenceStartedAt: now,
            currentlyPresent: true,
            accumulatedMs: 0,
          })
          .returning();
      } else if (!presence.currentlyPresent) {
        [presence] = await db
          .update(characterCountryPresence)
          .set({ currentlyPresent: true, presenceStartedAt: now })
          .where(eq(characterCountryPresence.id, presence.id))
          .returning();
      }
    }

    const days = presence ? presenceDays(effectivePresenceMs(presence, now)) : 0;
    if (days < country.citizenshipResidencyDays) {
      throw new BadRequestException(
        `${country.name} requires ${country.citizenshipResidencyDays} day(s) of presence; you have ${days}`,
      );
    }

    const [doc] = await db
      .insert(characterNationalIds)
      .values({
        characterId: character.id,
        countryId: country.id,
        documentNumber: nationalDocNumber(country.code),
        status: "active",
      })
      .returning();

    if (!doc) throw new BadRequestException("Could not issue national ID");

    await this.events.emit({
      type: WorldEventType.NationalIdIssued,
      payload: {
        countryId: country.id,
        countryCode: country.code,
        documentNumber: doc.documentNumber,
      },
      actorCharacterId: character.id,
      subjectType: "character_national_id",
      subjectId: doc.id,
    });

    return {
      documentNumber: doc.documentNumber,
      nationality: country.name,
      countryCode: country.code,
      issuedAt: doc.issuedAt,
      note: `Issued ${country.name} identity card. Nationality: ${country.name}.`,
    };
  }
}
