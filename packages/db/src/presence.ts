import { and, eq } from "drizzle-orm";
import {
  characterCountryPresence,
  cities,
  countries,
  districts,
  regions,
} from "./schema/index.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type PresenceDb = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export async function countryIdForDistrict(
  db: PresenceDb,
  districtId: string | null | undefined,
): Promise<string | null> {
  if (!districtId) return null;
  const [row] = await db
    .select({ countryId: countries.id })
    .from(districts)
    .innerJoin(cities, eq(districts.cityId, cities.id))
    .innerJoin(regions, eq(cities.regionId, regions.id))
    .innerJoin(countries, eq(regions.countryId, countries.id))
    .where(eq(districts.id, districtId))
    .limit(1);
  return row?.countryId ?? null;
}

export function effectivePresenceMs(
  row: {
    accumulatedMs: number;
    currentlyPresent: boolean;
    presenceStartedAt: Date | null;
  },
  now: Date,
): number {
  let ms = row.accumulatedMs ?? 0;
  if (row.currentlyPresent && row.presenceStartedAt) {
    ms += Math.max(0, now.getTime() - new Date(row.presenceStartedAt).getTime());
  }
  return ms;
}

export function presenceDays(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Close presence in fromCountry and open/continue in toCountry (no-op if same). */
export async function syncPresenceOnCountryChange(
  db: PresenceDb,
  characterId: string,
  fromCountryId: string | null,
  toCountryId: string | null,
  at: Date,
) {
  if (fromCountryId && fromCountryId === toCountryId) return;

  if (fromCountryId) {
    const [fromRow] = await db
      .select()
      .from(characterCountryPresence)
      .where(
        and(
          eq(characterCountryPresence.characterId, characterId),
          eq(characterCountryPresence.countryId, fromCountryId),
        ),
      )
      .limit(1);

    if (fromRow?.currentlyPresent && fromRow.presenceStartedAt) {
      const add = Math.max(0, at.getTime() - new Date(fromRow.presenceStartedAt).getTime());
      await db
        .update(characterCountryPresence)
        .set({
          accumulatedMs: (fromRow.accumulatedMs ?? 0) + add,
          currentlyPresent: false,
          presenceStartedAt: null,
          lastLeftAt: at,
        })
        .where(eq(characterCountryPresence.id, fromRow.id));
    } else if (fromRow) {
      await db
        .update(characterCountryPresence)
        .set({ currentlyPresent: false, presenceStartedAt: null, lastLeftAt: at })
        .where(eq(characterCountryPresence.id, fromRow.id));
    }
  }

  if (!toCountryId) return;

  const [toRow] = await db
    .select()
    .from(characterCountryPresence)
    .where(
      and(
        eq(characterCountryPresence.characterId, characterId),
        eq(characterCountryPresence.countryId, toCountryId),
      ),
    )
    .limit(1);

  if (toRow) {
    if (!toRow.currentlyPresent) {
      await db
        .update(characterCountryPresence)
        .set({ currentlyPresent: true, presenceStartedAt: at })
        .where(eq(characterCountryPresence.id, toRow.id));
    }
  } else {
    await db.insert(characterCountryPresence).values({
      characterId,
      countryId: toCountryId,
      firstEnteredAt: at,
      presenceStartedAt: at,
      currentlyPresent: true,
      accumulatedMs: 0,
    });
  }
}

export async function syncPresenceOnDistrictMove(
  db: PresenceDb,
  characterId: string,
  fromDistrictId: string | null,
  toDistrictId: string | null,
  at: Date,
) {
  const fromCountryId = await countryIdForDistrict(db, fromDistrictId);
  const toCountryId = await countryIdForDistrict(db, toDistrictId);
  await syncPresenceOnCountryChange(db, characterId, fromCountryId, toCountryId, at);
  return { fromCountryId, toCountryId };
}
