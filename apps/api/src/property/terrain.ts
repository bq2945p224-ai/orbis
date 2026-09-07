import { classifyTerrain, type TerrainClass } from "@orbis/contracts";

export type TerrainSample = {
  elevationM: number | null;
  terrain: TerrainClass;
};

/** Sample elevation via Open-Meteo (no API key). */
export async function sampleTerrain(lat: number, lng: number): Promise<TerrainSample> {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lng))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { elevationM: null, terrain: "unknown" };
    const data = (await res.json()) as { elevation?: number[] };
    const elevationM = Array.isArray(data.elevation) ? data.elevation[0] : null;
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) {
      return { elevationM: null, terrain: "unknown" };
    }
    return { elevationM, terrain: classifyTerrain(elevationM) };
  } catch {
    return { elevationM: null, terrain: "unknown" };
  }
}
