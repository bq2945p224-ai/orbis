import { BadRequestException } from "@nestjs/common";
import { characters, and, eq } from "@orbis/db";
import type { AuthedAccount } from "../auth/auth.guard.js";
import type { createDb } from "@orbis/db";

type Db = ReturnType<typeof createDb>;

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

export function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}
