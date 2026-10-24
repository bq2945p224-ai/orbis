import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  candidacies,
  characterNationalIds,
  characters,
  cities,
  countries,
  districts,
  elections,
  governmentOffices,
  laws,
  partyMembers,
  politicalParties,
  regions,
  votes,
  worldClock,
  and,
  desc,
  eq,
  inArray,
} from "@orbis/db";
import {
  createPartySchema,
  enactLawSchema,
  openElectionSchema,
  voteSchema,
  WorldEventType,
} from "@orbis/contracts";
import { z } from "zod";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";
import type { createDb } from "@orbis/db";

type Db = ReturnType<typeof createDb>;

const joinPartySchema = z.object({
  partyId: z.string().uuid(),
});

const candidacySchema = z.object({
  electionId: z.string().uuid(),
});

@Injectable()
export class PoliticsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  private async resolveCountryId(db: Db, character: { locationDistrictId: string | null }) {
    if (!character.locationDistrictId) {
      throw new BadRequestException("Character has no location");
    }
    const [row] = await db
      .select({ countryId: countries.id })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .innerJoin(regions, eq(cities.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(districts.id, character.locationDistrictId))
      .limit(1);
    if (!row) throw new BadRequestException("Could not resolve country");
    return row.countryId;
  }

  private async requireCitizenship(db: Db, characterId: string, countryId: string) {
    const [idCard] = await db
      .select()
      .from(characterNationalIds)
      .where(
        and(
          eq(characterNationalIds.characterId, characterId),
          eq(characterNationalIds.countryId, countryId),
          eq(characterNationalIds.status, "active"),
        ),
      )
      .limit(1);
    if (!idCard) {
      throw new ForbiddenException(
        "National ID for this country required — earn citizenship on Identity before voting or running",
      );
    }
    return idCard;
  }

  async listParties(account: AuthedAccount) {
    const db = this.dbService.db;
    await requireLivingCharacter(db, account);
    const rows = await db
      .select({
        id: politicalParties.id,
        name: politicalParties.name,
        platform: politicalParties.platform,
        countryName: countries.name,
        createdAt: politicalParties.createdAt,
      })
      .from(politicalParties)
      .innerJoin(countries, eq(politicalParties.countryId, countries.id))
      .orderBy(desc(politicalParties.createdAt));
    return { parties: rows };
  }

  async createParty(account: AuthedAccount, body: unknown) {
    const input = createPartySchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const countryId = await this.resolveCountryId(db, character);
    await this.requireCitizenship(db, character.id, countryId);

    const [existingMember] = await db
      .select()
      .from(partyMembers)
      .where(eq(partyMembers.characterId, character.id))
      .limit(1);
    if (existingMember) throw new BadRequestException("Already in a party");

    const [party] = await db
      .insert(politicalParties)
      .values({
        name: input.name,
        platform: input.platform ?? "",
        countryId,
      })
      .returning();

    if (!party) throw new BadRequestException("Could not create party");

    await db.insert(partyMembers).values({
      partyId: party.id,
      characterId: character.id,
      role: "founder",
    });

    return { partyId: party.id, name: party.name, countryId };
  }

  async joinParty(account: AuthedAccount, body: unknown) {
    const input = joinPartySchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [existingMember] = await db
      .select()
      .from(partyMembers)
      .where(eq(partyMembers.characterId, character.id))
      .limit(1);
    if (existingMember) throw new BadRequestException("Already in a party");

    const [party] = await db
      .select()
      .from(politicalParties)
      .where(eq(politicalParties.id, input.partyId))
      .limit(1);
    if (!party) throw new NotFoundException("Party not found");
    await this.requireCitizenship(db, character.id, party.countryId);

    const [membership] = await db
      .insert(partyMembers)
      .values({
        partyId: input.partyId,
        characterId: character.id,
        role: "member",
      })
      .returning();

    return { membershipId: membership!.id, partyId: input.partyId };
  }

  async listElections(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: elections.id,
        countryId: elections.countryId,
        countryName: countries.name,
        office: elections.office,
        status: elections.status,
        opensAt: elections.opensAt,
        closesAt: elections.closesAt,
        createdAt: elections.createdAt,
      })
      .from(elections)
      .innerJoin(countries, eq(elections.countryId, countries.id))
      .orderBy(desc(elections.createdAt));

    const electionIds = rows.map((r) => r.id);
    const candidateRows =
      electionIds.length === 0
        ? []
        : await db
            .select({
              electionId: candidacies.electionId,
              characterId: candidacies.characterId,
              characterName: characters.name,
              partyId: candidacies.partyId,
            })
            .from(candidacies)
            .innerJoin(characters, eq(candidacies.characterId, characters.id))
            .where(inArray(candidacies.electionId, electionIds));

    const byElection = new Map<string, typeof candidateRows>();
    for (const c of candidateRows) {
      const list = byElection.get(c.electionId) ?? [];
      list.push(c);
      byElection.set(c.electionId, list);
    }

    return {
      elections: rows.map((el) => ({
        ...el,
        candidates: byElection.get(el.id) ?? [],
      })),
      franchiseNote:
        "Voting and candidacy require an active national ID for the election's country (see Identity).",
    };
  }

  async declareCandidacy(account: AuthedAccount, body: unknown) {
    const input = candidacySchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [election] = await db
      .select()
      .from(elections)
      .where(and(eq(elections.id, input.electionId), eq(elections.status, "open")))
      .limit(1);
    if (!election) throw new NotFoundException("Election not found or closed");
    if (election.closesAt <= new Date()) {
      throw new BadRequestException("Election has closed");
    }
    await this.requireCitizenship(db, character.id, election.countryId);

    const [partyMembership] = await db
      .select()
      .from(partyMembers)
      .where(eq(partyMembers.characterId, character.id))
      .limit(1);

    const [candidacy] = await db
      .insert(candidacies)
      .values({
        electionId: input.electionId,
        characterId: character.id,
        partyId: partyMembership?.partyId ?? null,
      })
      .returning();

    if (!candidacy) throw new BadRequestException("Could not declare candidacy");

    return {
      candidacyId: candidacy.id,
      electionId: input.electionId,
      characterId: character.id,
    };
  }

  async vote(account: AuthedAccount, body: unknown) {
    const input = voteSchema.parse(body);
    const db = this.dbService.db;
    const voter = await requireLivingCharacter(db, account);

    const [election] = await db
      .select()
      .from(elections)
      .where(and(eq(elections.id, input.electionId), eq(elections.status, "open")))
      .limit(1);
    if (!election) throw new NotFoundException("Election not found or closed");
    if (election.closesAt <= new Date()) {
      throw new BadRequestException("Election has closed");
    }
    await this.requireCitizenship(db, voter.id, election.countryId);

    const [candidate] = await db
      .select()
      .from(candidacies)
      .where(
        and(
          eq(candidacies.electionId, input.electionId),
          eq(candidacies.characterId, input.candidateCharacterId),
        ),
      )
      .limit(1);
    if (!candidate) throw new BadRequestException("Candidate not in this election");

    const [voteRow] = await db
      .insert(votes)
      .values({
        electionId: input.electionId,
        voterCharacterId: voter.id,
        candidateCharacterId: input.candidateCharacterId,
      })
      .returning();

    await this.events.emit({
      type: WorldEventType.VoteCast,
      payload: {
        electionId: input.electionId,
        voterCharacterId: voter.id,
        candidateCharacterId: input.candidateCharacterId,
      },
      actorCharacterId: voter.id,
      subjectType: "vote",
      subjectId: voteRow!.id,
    });

    return {
      voteId: voteRow!.id,
      electionId: input.electionId,
      candidateCharacterId: input.candidateCharacterId,
    };
  }

  async openElection(account: AuthedAccount, body: unknown) {
    const input = openElectionSchema.parse(body ?? {});
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const countryId = await this.resolveCountryId(db, character);

    const [office] = await db
      .select()
      .from(governmentOffices)
      .where(
        and(
          eq(governmentOffices.countryId, countryId),
          eq(governmentOffices.holderCharacterId, character.id),
        ),
      )
      .limit(1);
    if (!office) {
      throw new ForbiddenException("Only a sitting office-holder can open an election");
    }

    const officeName = input.office?.trim() || office.office;
    const [existingOpen] = await db
      .select()
      .from(elections)
      .where(
        and(
          eq(elections.countryId, countryId),
          eq(elections.office, officeName),
          eq(elections.status, "open"),
        ),
      )
      .limit(1);
    if (existingOpen) {
      throw new BadRequestException("An open election already exists for this office");
    }

    const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    const now = clock?.simTime ?? new Date();
    const durationMs = input.durationMs ?? 7 * 24 * 60 * 60 * 1000;
    const closesAt = new Date(now.getTime() + durationMs);

    const [election] = await db
      .insert(elections)
      .values({
        countryId,
        office: officeName,
        status: "open",
        opensAt: now,
        closesAt,
      })
      .returning();

    if (!election) throw new BadRequestException("Could not open election");

    await this.events.emit({
      type: WorldEventType.ElectionOpened,
      payload: {
        electionId: election.id,
        office: officeName,
        countryId,
        closesAt: election.closesAt,
      },
      actorCharacterId: character.id,
      subjectType: "election",
      subjectId: election.id,
    });

    return {
      electionId: election.id,
      office: election.office,
      countryId,
      opensAt: election.opensAt,
      closesAt: election.closesAt,
    };
  }

  async listOffices(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: governmentOffices.id,
        countryId: governmentOffices.countryId,
        countryName: countries.name,
        office: governmentOffices.office,
        holderCharacterId: governmentOffices.holderCharacterId,
        holderName: characters.name,
        sinceAt: governmentOffices.sinceAt,
      })
      .from(governmentOffices)
      .innerJoin(countries, eq(governmentOffices.countryId, countries.id))
      .leftJoin(characters, eq(governmentOffices.holderCharacterId, characters.id))
      .orderBy(desc(governmentOffices.sinceAt));

    return { offices: rows };
  }

  async listLaws(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: laws.id,
        countryId: laws.countryId,
        countryName: countries.name,
        title: laws.title,
        body: laws.body,
        effectKey: laws.effectKey,
        effectValue: laws.effectValue,
        enactedByCharacterId: laws.enactedByCharacterId,
        enactorName: characters.name,
        enactedAt: laws.enactedAt,
        active: laws.active,
      })
      .from(laws)
      .innerJoin(countries, eq(laws.countryId, countries.id))
      .leftJoin(characters, eq(laws.enactedByCharacterId, characters.id))
      .where(eq(laws.active, true))
      .orderBy(desc(laws.enactedAt));

    return {
      laws: rows,
      effectCatalog: [
        {
          key: "property_tax_cents_per_day",
          label: "Property tax (¢/day per parcel)",
          description:
            "Sets the daily property tax charged to parcel owners in this country. Replaces the previous active tax law.",
        },
        {
          key: "sales_tax_bps",
          label: "Sales tax (basis points)",
          description:
            "Added to market purchase price (100 bps = 1%). Latest active sales-tax law wins.",
        },
      ],
    };
  }

  async enactLaw(account: AuthedAccount, body: unknown) {
    const input = enactLawSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const countryId = await this.resolveCountryId(db, character);

    const [office] = await db
      .select()
      .from(governmentOffices)
      .where(
        and(
          eq(governmentOffices.countryId, countryId),
          eq(governmentOffices.holderCharacterId, character.id),
        ),
      )
      .limit(1);
    if (!office) {
      throw new ForbiddenException("You do not hold a government office in your country");
    }

    if (input.effectKey && input.effectValue == null) {
      throw new BadRequestException("effectValue required when effectKey is set");
    }

    if (input.effectKey) {
      await db
        .update(laws)
        .set({ active: false })
        .where(
          and(
            eq(laws.countryId, countryId),
            eq(laws.effectKey, input.effectKey),
            eq(laws.active, true),
          ),
        );
    }

    const [law] = await db
      .insert(laws)
      .values({
        countryId,
        title: input.title,
        body: input.body,
        effectKey: input.effectKey ?? null,
        effectValue: input.effectValue ?? null,
        enactedByCharacterId: character.id,
      })
      .returning();

    if (!law) throw new BadRequestException("Could not enact law");

    await this.events.emit({
      type: WorldEventType.LawEnacted,
      payload: {
        lawId: law.id,
        title: law.title,
        office: office.office,
        effectKey: law.effectKey,
        effectValue: law.effectValue,
      },
      actorCharacterId: character.id,
      subjectType: "law",
      subjectId: law.id,
    });

    return {
      lawId: law.id,
      title: law.title,
      effectKey: law.effectKey,
      effectValue: law.effectValue,
      enactedAt: law.enactedAt,
    };
  }
}
