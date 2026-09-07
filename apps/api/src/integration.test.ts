import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { createDb, accounts, districts, sessions, worldClock } from "@orbis/db";
import { eq } from "@orbis/db";
import * as argon2 from "argon2";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

const url = process.env.DATABASE_URL ?? "postgresql://orbis:orbis@localhost:5432/orbis";

describe("phase1 integration", () => {
  const db = createDb(url);
  const suffix = randomBytes(4).toString("hex");
  let accountId = "";

  beforeAll(async () => {
    const [clock] = await db.select().from(worldClock).limit(1);
    expect(clock).toBeTruthy();
  });

  afterAll(async () => {
    if (accountId) {
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("enforces one alive character per account via unique index", async () => {
    const passwordHash = await argon2.hash("test-password-123", { type: argon2.argon2id });
    const [account] = await db
      .insert(accounts)
      .values({
        email: `test_${suffix}@orbis.local`,
        username: `user_${suffix}`,
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .returning();
    accountId = account!.id;

    const [district] = await db.select().from(districts).limit(1);
    expect(district).toBeTruthy();

    const { characters } = await import("@orbis/db");
    await db.insert(characters).values({
      accountId,
      name: "First",
      locationDistrictId: district!.id,
      status: "alive",
    });

    await expect(
      db.insert(characters).values({
        accountId,
        name: "Second",
        locationDistrictId: district!.id,
        status: "alive",
      }),
    ).rejects.toThrow();
  });

  it("revoked sessions are distinguishable", async () => {
    const tokenHash = createHash("sha256").update(`tok_${suffix}`).digest("hex");
    const [session] = await db
      .insert(sessions)
      .values({
        accountId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();

    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session!.id));

    const [row] = await db.select().from(sessions).where(eq(sessions.id, session!.id));
    expect(row?.revokedAt).toBeTruthy();
  });
});
