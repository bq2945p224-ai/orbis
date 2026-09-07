import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  cities,
  districts,
  employers,
  employments,
  jobPostings,
  travelTrips,
  and,
  desc,
  eq,
  isNull,
} from "@orbis/db";
import { applyJobSchema, WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { SkillsService } from "../skills/skills.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class JobsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(SkillsService) private readonly skills: SkillsService,
  ) {}

  async listOpen(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const rows = await db
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        description: jobPostings.description,
        requiredSkillKey: jobPostings.requiredSkillKey,
        requiredSkillLevel: jobPostings.requiredSkillLevel,
        salaryCentsPerDay: jobPostings.salaryCentsPerDay,
        employerId: employers.id,
        employerName: employers.name,
        employerSystemKey: employers.systemKey,
        districtId: employers.districtId,
        districtName: districts.name,
        cityName: cities.name,
      })
      .from(jobPostings)
      .innerJoin(employers, eq(jobPostings.employerId, employers.id))
      .innerJoin(districts, eq(employers.districtId, districts.id))
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .where(eq(jobPostings.open, true))
      .orderBy(desc(jobPostings.createdAt));

    const levelBySkill = new Map<string, number>();
    for (const job of rows) {
      if (job.requiredSkillKey && !levelBySkill.has(job.requiredSkillKey)) {
        levelBySkill.set(
          job.requiredSkillKey,
          await this.skills.getLevel(character.id, job.requiredSkillKey),
        );
      }
    }

    return {
      characterId: character.id,
      locationDistrictId: character.locationDistrictId,
      jobs: rows.map((row) => {
        const have = row.requiredSkillKey
          ? (levelBySkill.get(row.requiredSkillKey) ?? 0)
          : 0;
        const skillOk =
          !row.requiredSkillKey || have >= row.requiredSkillLevel;
        const isWorldGov = row.employerSystemKey === "world_government";
        const locationOk =
          isWorldGov || character.locationDistrictId === row.districtId;
        return {
          ...row,
          isWorldGovernment: isWorldGov,
          eligible: skillOk && locationOk,
          skillOk,
          locationOk,
          yourSkillLevel: have,
        };
      }),
    };
  }

  async mine(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const rows = await db
      .select({
        id: employments.id,
        title: employments.title,
        salaryCentsPerDay: employments.salaryCentsPerDay,
        startedAt: employments.startedAt,
        endedAt: employments.endedAt,
        endReason: employments.endReason,
        employerId: employers.id,
        employerName: employers.name,
        districtId: employers.districtId,
        districtName: districts.name,
      })
      .from(employments)
      .innerJoin(employers, eq(employments.employerId, employers.id))
      .innerJoin(districts, eq(employers.districtId, districts.id))
      .where(eq(employments.characterId, character.id))
      .orderBy(desc(employments.startedAt));

    return {
      characterId: character.id,
      current: rows.find((r) => !r.endedAt) ?? null,
      history: rows.filter((r) => r.endedAt),
    };
  }

  async apply(account: AuthedAccount, body: unknown) {
    const input = applyJobSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [inTransit] = await db
      .select()
      .from(travelTrips)
      .where(
        and(eq(travelTrips.characterId, character.id), eq(travelTrips.status, "in_transit")),
      )
      .limit(1);
    if (inTransit) {
      throw new BadRequestException("Cannot apply for a job while traveling");
    }

    const [posting] = await db
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        open: jobPostings.open,
        requiredSkillKey: jobPostings.requiredSkillKey,
        requiredSkillLevel: jobPostings.requiredSkillLevel,
        salaryCentsPerDay: jobPostings.salaryCentsPerDay,
        employerId: employers.id,
        employerName: employers.name,
        employerSystemKey: employers.systemKey,
        districtId: employers.districtId,
      })
      .from(jobPostings)
      .innerJoin(employers, eq(jobPostings.employerId, employers.id))
      .where(eq(jobPostings.id, input.jobPostingId))
      .limit(1);

    if (!posting || !posting.open) throw new NotFoundException("Job posting not found");
    const isWorldGov = posting.employerSystemKey === "world_government";
    if (!isWorldGov && character.locationDistrictId !== posting.districtId) {
      throw new BadRequestException("You must be in the employer's district to apply");
    }

    const level = await this.skills.getLevel(character.id, posting.requiredSkillKey);
    if (posting.requiredSkillKey && level < posting.requiredSkillLevel) {
      throw new BadRequestException(
        `Requires ${posting.requiredSkillKey} level ${posting.requiredSkillLevel} (you have ${level})`,
      );
    }

    const [active] = await db
      .select()
      .from(employments)
      .where(and(eq(employments.characterId, character.id), isNull(employments.endedAt)))
      .limit(1);
    if (active) {
      throw new BadRequestException("Resign from your current job before applying");
    }

    const [employment] = await db
      .insert(employments)
      .values({
        characterId: character.id,
        employerId: posting.employerId,
        jobPostingId: posting.id,
        title: posting.title,
        salaryCentsPerDay: posting.salaryCentsPerDay,
      })
      .returning();

    if (!employment) throw new BadRequestException("Could not create employment");

    await this.events.emit({
      type: WorldEventType.EmployeeHired,
      payload: {
        employmentId: employment.id,
        employerId: posting.employerId,
        title: posting.title,
        salaryCentsPerDay: posting.salaryCentsPerDay,
      },
      actorCharacterId: character.id,
      subjectType: "employment",
      subjectId: employment.id,
    });

    return {
      employmentId: employment.id,
      title: employment.title,
      employerName: posting.employerName,
      salaryCentsPerDay: employment.salaryCentsPerDay,
      startedAt: employment.startedAt,
    };
  }

  async resign(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const [active] = await db
      .select()
      .from(employments)
      .where(and(eq(employments.characterId, character.id), isNull(employments.endedAt)))
      .limit(1);
    if (!active) throw new BadRequestException("You are not employed");

    const [updated] = await db
      .update(employments)
      .set({ endedAt: new Date(), endReason: "resigned" })
      .where(eq(employments.id, active.id))
      .returning();

    await this.events.emit({
      type: WorldEventType.EmployeeResigned,
      payload: { employmentId: active.id, title: active.title },
      actorCharacterId: character.id,
      subjectType: "employment",
      subjectId: active.id,
    });

    return {
      employmentId: updated!.id,
      endedAt: updated!.endedAt,
      endReason: updated!.endReason,
    };
  }
}
