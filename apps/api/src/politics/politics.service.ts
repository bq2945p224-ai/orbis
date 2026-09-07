import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  candidacies,
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
  and,
  desc,
  eq,
} from "@orbis/db";
import {
  createPartySchema,
  enactLawSchema,
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

    return { elections: rows };
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

    return { laws: rows };
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

    const [law] = await db
      .insert(laws)
      .values({
        countryId,
        title: input.title,
        body: input.body,
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
      },
      actorCharacterId: character.id,
      subjectType: "law",
      subjectId: law.id,
    });

    return {
      lawId: law.id,
      title: law.title,
      enactedAt: law.enactedAt,
    };
  }
}
