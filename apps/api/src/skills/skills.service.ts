import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  characterSkills,
  characterStudy,
  skillDefinitions,
  worldClock,
  and,
  asc,
  eq,
} from "@orbis/db";
import { focusSkillSchema, studyBuffSchema, WorldEventType } from "@orbis/contracts";
import { randomUUID } from "node:crypto";
import { DbService } from "../core/db.service.js";
import { EconomyService } from "../economy/economy.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export type StudyBuffMode = "self_study" | "tutoring" | "university";
export type BuffPeriod = "day" | "week" | "month" | "year";

/** XP gained per real-time hour while focused on a skill. */
export function xpPerHour(mode: StudyBuffMode): number {
  switch (mode) {
    case "self_study":
      return 10;
    case "tutoring":
      return 35;
    case "university":
      return 100;
  }
}

/** XP required to advance from `level` → `level+1`. */
export function xpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(Math.max(0, level) + 1, 2));
}

export function periodMs(period: BuffPeriod): number {
  switch (period) {
    case "day":
      return DAY_MS;
    case "week":
      return WEEK_MS;
    case "month":
      return MONTH_MS;
    case "year":
      return YEAR_MS;
  }
}

/** Recurring subscription price for one billing period. */
export function buffPeriodCostCents(
  mode: "tutoring" | "university",
  period: BuffPeriod,
  skillLevel: number,
): number {
  const tier = skillLevel + 1;
  const table = {
    tutoring: { day: 12_000, week: 75_000, month: 250_000, year: 2_500_000 },
    university: { day: 45_000, week: 300_000, month: 1_000_000, year: 10_000_000 },
  } as const;
  return table[mode][period] * tier;
}

function periodPrices(mode: "tutoring" | "university", level: number) {
  return {
    day: buffPeriodCostCents(mode, "day", level),
    week: buffPeriodCostCents(mode, "week", level),
    month: buffPeriodCostCents(mode, "month", level),
    year: buffPeriodCostCents(mode, "year", level),
  };
}

@Injectable()
export class SkillsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EconomyService) private readonly economy: EconomyService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  private async ensureStudyRow(characterId: string) {
    const db = this.dbService.db;
    await db
      .insert(characterStudy)
      .values({ characterId, buffMode: "self_study" })
      .onConflictDoNothing();
    const [row] = await db
      .select()
      .from(characterStudy)
      .where(eq(characterStudy.characterId, characterId))
      .limit(1);
    return row!;
  }

  async listForAccount(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const study = await this.ensureStudyRow(character.id);
    const buff = (study.buffMode as StudyBuffMode) || "self_study";
    const focusLevel = study.focusSkillKey
      ? await this.getLevel(character.id, study.focusSkillKey)
      : 0;

    const mine = await db
      .select({
        key: characterSkills.skillKey,
        level: characterSkills.level,
        experience: characterSkills.experience,
        unlockedAt: characterSkills.unlockedAt,
        name: skillDefinitions.name,
        description: skillDefinitions.description,
      })
      .from(characterSkills)
      .innerJoin(skillDefinitions, eq(characterSkills.skillKey, skillDefinitions.key))
      .where(eq(characterSkills.characterId, character.id))
      .orderBy(asc(skillDefinitions.name));

    return {
      characterId: character.id,
      study: {
        focusSkillKey: study.focusSkillKey,
        buffMode: buff,
        buffPeriod: buff === "self_study" ? null : study.buffPeriod,
        nextBillingAt: buff === "self_study" ? null : study.nextBillingAt,
        xpPerHour: xpPerHour(buff),
        rates: {
          self_study: xpPerHour("self_study"),
          tutoring: xpPerHour("tutoring"),
          university: xpPerHour("university"),
        },
        subscriptionPrices: study.focusSkillKey
          ? {
              tutoring: periodPrices("tutoring", focusLevel),
              university: periodPrices("university", focusLevel),
            }
          : null,
      },
      skills: mine.map((row) => {
        const needed = xpToNextLevel(row.level);
        return {
          key: row.key,
          name: row.name,
          description: row.description,
          level: row.level,
          experience: row.experience,
          xpToNext: needed,
          progressPct: Math.min(100, Math.round((row.experience / needed) * 100)),
          unlockedAt: row.unlockedAt,
          isFocus: study.focusSkillKey === row.key,
        };
      }),
    };
  }

  async catalog(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const unlocked = await db
      .select({ key: characterSkills.skillKey, level: characterSkills.level })
      .from(characterSkills)
      .where(eq(characterSkills.characterId, character.id));
    const unlockedKeys = new Set(unlocked.map((u) => u.key));
    const levelByKey = new Map(unlocked.map((u) => [u.key, u.level]));
    const defs = await db.select().from(skillDefinitions).orderBy(asc(skillDefinitions.name));

    const buffQuote = (level: number) => ({
      self_study: { xpPerHour: xpPerHour("self_study") },
      tutoring: {
        xpPerHour: xpPerHour("tutoring"),
        ...periodPrices("tutoring", level),
      },
      university: {
        xpPerHour: xpPerHour("university"),
        ...periodPrices("university", level),
      },
    });

    return {
      characterId: character.id,
      available: defs
        .filter((d) => !unlockedKeys.has(d.key))
        .map((d) => ({
          key: d.key,
          name: d.name,
          description: d.description,
          category: d.category,
          xpToLevel1: xpToNextLevel(0),
          buffs: buffQuote(0),
        })),
      unlocked: defs
        .filter((d) => unlockedKeys.has(d.key))
        .map((d) => {
          const level = levelByKey.get(d.key) ?? 0;
          return {
            key: d.key,
            name: d.name,
            description: d.description,
            category: d.category,
            level,
            xpToNext: xpToNextLevel(level),
            buffs: buffQuote(level),
          };
        }),
      categories: [...new Set(defs.map((d) => d.category))].sort(),
    };
  }

  async focus(account: AuthedAccount, body: unknown) {
    const input = focusSkillSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [def] = await db
      .select()
      .from(skillDefinitions)
      .where(eq(skillDefinitions.key, input.skillKey))
      .limit(1);
    if (!def) throw new NotFoundException("Unknown skill");

    let [skill] = await db
      .select()
      .from(characterSkills)
      .where(
        and(
          eq(characterSkills.characterId, character.id),
          eq(characterSkills.skillKey, input.skillKey),
        ),
      )
      .limit(1);

    let newlyUnlocked = false;
    if (!skill) {
      [skill] = await db
        .insert(characterSkills)
        .values({
          characterId: character.id,
          skillKey: input.skillKey,
          level: 0,
          experience: 0,
          progressMs: 0,
        })
        .returning();
      newlyUnlocked = true;
      if (!skill) throw new BadRequestException("Could not unlock skill");
      await this.events.emit({
        type: WorldEventType.SkillUnlocked,
        payload: { skillKey: input.skillKey, via: "focus" },
        actorCharacterId: character.id,
        subjectType: "character",
        subjectId: character.id,
      });
    }

    await this.ensureStudyRow(character.id);
    await db
      .update(characterStudy)
      .set({ focusSkillKey: input.skillKey, updatedAt: new Date() })
      .where(eq(characterStudy.characterId, character.id));

    return {
      newlyUnlocked,
      focusSkillKey: input.skillKey,
      skill: { key: def.key, name: def.name, level: skill.level, experience: skill.experience },
    };
  }

  /**
   * Start a continuous tutoring/university subscription.
   * Charges the first period upfront; worker renews until cancelled or broke.
   */
  async activateBuff(account: AuthedAccount, body: unknown) {
    const input = studyBuffSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    const study = await this.ensureStudyRow(character.id);
    if (!study.focusSkillKey) {
      throw new BadRequestException("Choose a skill to study before subscribing");
    }

    const level = await this.getLevel(character.id, study.focusSkillKey);
    const cost = buffPeriodCostCents(input.mode, input.period, level);
    const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    const now = clock?.simTime ?? new Date();
    const nextBillingAt = new Date(now.getTime() + periodMs(input.period));

    await this.economy.debitCharacter(
      character.id,
      cost,
      `skill_${input.mode}_subscription`,
      `skill-sub:${character.id}:${input.mode}:${input.period}:${randomUUID()}`,
      {
        skillKey: study.focusSkillKey,
        mode: input.mode,
        period: input.period,
        billing: "initial",
      },
    );

    await db
      .update(characterStudy)
      .set({
        buffMode: input.mode,
        buffPeriod: input.period,
        nextBillingAt,
        buffExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(characterStudy.characterId, character.id));

    return {
      buffMode: input.mode,
      buffPeriod: input.period,
      nextBillingAt,
      costCents: cost,
      xpPerHour: xpPerHour(input.mode),
      focusSkillKey: study.focusSkillKey,
    };
  }

  async clearBuff(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);
    await this.ensureStudyRow(character.id);
    await db
      .update(characterStudy)
      .set({
        buffMode: "self_study",
        buffPeriod: null,
        nextBillingAt: null,
        buffExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(characterStudy.characterId, character.id));
    return { buffMode: "self_study" as const, xpPerHour: xpPerHour("self_study") };
  }

  async getLevel(characterId: string, skillKey: string | null) {
    if (!skillKey) return 0;
    const db = this.dbService.db;
    const [row] = await db
      .select()
      .from(characterSkills)
      .where(
        and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillKey, skillKey)),
      )
      .limit(1);
    return row?.level ?? 0;
  }
}
