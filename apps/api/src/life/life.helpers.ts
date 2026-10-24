import { BadRequestException } from "@nestjs/common";
import { characterHealth, characters, and, eq } from "@orbis/db";
import type { AuthedAccount } from "../auth/auth.guard.js";
import type { createDb } from "@orbis/db";

type Db = ReturnType<typeof createDb>;

export const WORK_MIN_HP = 30;
export const WORK_MIN_ENERGY = 15;
export const TRAVEL_MIN_HP = 25;

export async function requireLivingCharacter(db: Db, account: AuthedAccount) {
  const [character] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.accountId, account.id), eq(characters.status, "alive")))
    .limit(1);
  if (!character) {
    throw new BadRequestException("No living character on this account");
  }
  return character;
}

/** Block work/travel when injured, exhausted, or infectious — real-life capability constraints. */
export async function requireFitForActivity(
  db: Db,
  characterId: string,
  activity: "work" | "travel" | "forage",
) {
  const [health] = await db
    .select()
    .from(characterHealth)
    .where(eq(characterHealth.characterId, characterId))
    .limit(1);
  if (!health) return;

  if (activity === "travel") {
    if (health.hp < TRAVEL_MIN_HP) {
      throw new BadRequestException(
        `Too injured to travel (HP ${health.hp} < ${TRAVEL_MIN_HP})`,
      );
    }
    if (health.infectedPathogenKey) {
      throw new BadRequestException("Infected — seek treatment before travel");
    }
    return;
  }

  if (health.hp < WORK_MIN_HP) {
    throw new BadRequestException(
      `Too injured to work (HP ${health.hp} < ${WORK_MIN_HP})`,
    );
  }
  if (health.energy < WORK_MIN_ENERGY) {
    throw new BadRequestException(
      `Exhausted (energy ${Math.round(health.energy)} < ${WORK_MIN_ENERGY}) — rest or eat`,
    );
  }
  if (health.infectedPathogenKey && activity !== "forage") {
    throw new BadRequestException("Infected — clinic treatment required before working");
  }
}

export function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}
