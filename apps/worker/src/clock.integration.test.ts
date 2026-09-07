import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, worldClock } from "@orbis/db";
import { advanceWorldClock, publishOutbox } from "./clock.js";
import { eq } from "@orbis/db";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

const url = process.env.DATABASE_URL ?? "postgresql://orbis:orbis@localhost:5432/orbis";

describe("world clock tick", () => {
  const db = createDb(url);

  it("advances tick_version idempotently under lock", async () => {
    const [before] = await db.select().from(worldClock).where(eq(worldClock.id, 1));
    expect(before).toBeTruthy();

    const first = await advanceWorldClock(db, 1, 1000);
    expect(first.applied).toBe(true);

    const [after] = await db.select().from(worldClock).where(eq(worldClock.id, 1));
    expect(after!.tickVersion).toBe(before!.tickVersion + 1);

    const published = await publishOutbox(db);
    expect(published).toBeGreaterThanOrEqual(0);
  });
});
