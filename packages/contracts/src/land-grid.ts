/**
 * Claimable land grid keyed in 1 m Web Mercator cells.
 * UI/API can claim larger aligned blocks (10 / 100 / 1000 m) while zoomed out.
 */

export const LAND_BASE_CELL_M = 1;
/** Allowed claim sizes (meters on a side). Must divide evenly for nesting. */
export const LAND_CLAIM_SIZES_M = [1, 10, 100, 1000] as const;
export type LandClaimSizeM = (typeof LAND_CLAIM_SIZES_M)[number];

/** Base World Government list price per m² (cents). */
export const LAND_BASE_CENTS_PER_M2 = 2;
/** Extra cents added per richness point under the cell. */
export const LAND_RESOURCE_CENTS_PER_RICHNESS = 80;

/** @deprecated use LAND_BASE_CELL_M / claim size — kept for older imports */
export const LAND_CELL_SIZE_M = 100;
/** @deprecated */
export const LAND_CELL_AREA_M2 = 10_000;

const EARTH_RADIUS_M = 6_378_137;
const MAX_LAT = 85.05112878;

function clampLat(lat: number) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export function lngLatToMercator(lng: number, lat: number): { x: number; y: number } {
  const clamped = clampLat(lat);
  const x = (EARTH_RADIUS_M * lng * Math.PI) / 180;
  const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return { x, y };
}

export function mercatorToLngLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x / EARTH_RADIUS_M) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI);
  return { lng, lat: clampLat(lat) };
}

/** Southwest corner index in 1 m mercator cells. */
export function lngLatToCell(
  lng: number,
  lat: number,
  cellSizeM: number = LAND_BASE_CELL_M,
): { ix: number; iy: number } {
  const size = Math.max(1, Math.floor(cellSizeM));
  const { x, y } = lngLatToMercator(lng, lat);
  return {
    ix: Math.floor(x / size) * size, // store as 1m-origin aligned to block
    iy: Math.floor(y / size) * size,
  };
}

/** Map zoom → claim cell size (meters on a side). */
export function claimSizeForZoom(zoom: number): LandClaimSizeM | null {
  if (zoom < 12) return null;
  if (zoom < 14) return 1000;
  if (zoom < 16) return 100;
  if (zoom < 18) return 10;
  return 1;
}

export function cellBounds(ix: number, iy: number, cellSizeM: number = LAND_BASE_CELL_M) {
  const size = Math.max(1, Math.floor(cellSizeM));
  const minX = ix;
  const minY = iy;
  const maxX = ix + size;
  const maxY = iy + size;
  const sw = mercatorToLngLat(minX, minY);
  const ne = mercatorToLngLat(maxX, maxY);
  const nw = mercatorToLngLat(minX, maxY);
  const se = mercatorToLngLat(maxX, minY);
  return { sw, se, ne, nw, minX, minY, maxX, maxY, size };
}

export function cellPolygonRing(
  ix: number,
  iy: number,
  cellSizeM: number = LAND_BASE_CELL_M,
): [number, number][] {
  const { sw, se, ne, nw } = cellBounds(ix, iy, cellSizeM);
  return [
    [sw.lng, sw.lat],
    [se.lng, se.lat],
    [ne.lng, ne.lat],
    [nw.lng, nw.lat],
    [sw.lng, sw.lat],
  ];
}

export function cellCentroid(ix: number, iy: number, cellSizeM: number = LAND_BASE_CELL_M) {
  const { sw, ne } = cellBounds(ix, iy, cellSizeM);
  return { lng: (sw.lng + ne.lng) / 2, lat: (sw.lat + ne.lat) / 2 };
}

export function cellWkt(ix: number, iy: number, cellSizeM: number = LAND_BASE_CELL_M): string {
  const ring = cellPolygonRing(ix, iy, cellSizeM);
  const coords = ring.map(([lng, lat]) => `${lng} ${lat}`).join(",");
  return `POLYGON((${coords}))`;
}

export function cellAreaM2(cellSizeM: number): number {
  const size = Math.max(1, Math.floor(cellSizeM));
  return size * size;
}

export function baseCellPriceCents(areaM2: number, resourceRichnessTotal = 0): number {
  return (
    areaM2 * LAND_BASE_CENTS_PER_M2 +
    Math.round(resourceRichnessTotal * LAND_RESOURCE_CENTS_PER_RICHNESS)
  );
}

export function enumerateCellsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  cellSizeM: number,
  maxCells = 400,
): { ix: number; iy: number }[] {
  const size = Math.max(1, Math.floor(cellSizeM));
  const a = lngLatToCell(minLng, minLat, size);
  const b = lngLatToCell(maxLng, maxLat, size);
  const ix0 = Math.min(a.ix, b.ix);
  const ix1 = Math.max(a.ix, b.ix);
  const iy0 = Math.min(a.iy, b.iy);
  const iy1 = Math.max(a.iy, b.iy);
  const w = Math.floor((ix1 - ix0) / size) + 1;
  const h = Math.floor((iy1 - iy0) / size) + 1;
  if (w * h > maxCells || w * h <= 0) return [];

  const out: { ix: number; iy: number }[] = [];
  for (let iy = iy0; iy <= iy1; iy += size) {
    for (let ix = ix0; ix <= ix1; ix += size) {
      out.push({ ix, iy });
    }
  }
  return out;
}

/** Terrain classes used for construction difficulty. */
export type TerrainClass = "water" | "flat" | "hills" | "mountain" | "unknown";

export function classifyTerrain(elevationM: number | null | undefined): TerrainClass {
  if (elevationM == null || !Number.isFinite(elevationM)) return "unknown";
  if (elevationM <= 0.5) return "water";
  if (elevationM >= 2000) return "mountain";
  if (elevationM >= 800) return "hills";
  return "flat";
}

export const BUILDING_CATALOG = {
  shed: {
    key: "shed",
    name: "Shed",
    description: "Small utility structure.",
    minAreaM2: 4,
    baseCostCents: 5_000,
    multipliers: { water: null, flat: 1, hills: 1.4, mountain: 4, unknown: 1.2 },
  },
  house: {
    key: "house",
    name: "House",
    description: "Standard family home.",
    minAreaM2: 80,
    baseCostCents: 80_000,
    multipliers: { water: null, flat: 1, hills: 2.5, mountain: 12, unknown: 1.5 },
  },
  mansion: {
    key: "mansion",
    name: "Mansion",
    description: "Large luxury residence.",
    minAreaM2: 600,
    baseCostCents: 2_500_000,
    multipliers: { water: null, flat: 1, hills: 4, mountain: 40, unknown: 2 },
  },
  skyscraper: {
    key: "skyscraper",
    name: "Skyscraper",
    description: "High-rise tower. Needs solid, flat ground.",
    minAreaM2: 2_500,
    baseCostCents: 75_000_000,
    multipliers: { water: null, flat: 1, hills: 35, mountain: 800, unknown: 5 },
  },
} as const;

export type BuildingTypeKey = keyof typeof BUILDING_CATALOG;

export function buildingQuote(
  type: BuildingTypeKey,
  terrain: TerrainClass,
): { allowed: boolean; costCents: number; reason?: string; multiplier: number } {
  const def = BUILDING_CATALOG[type];
  const mult = def.multipliers[terrain];
  if (mult == null) {
    return {
      allowed: false,
      costCents: 0,
      multiplier: Infinity,
      reason:
        terrain === "water"
          ? `Cannot build a ${def.name.toLowerCase()} on water.`
          : `Cannot build a ${def.name.toLowerCase()} on this terrain.`,
    };
  }
  if (terrain === "mountain" && type === "skyscraper") {
    return {
      allowed: false,
      costCents: 0,
      multiplier: Infinity,
      reason: "Building a skyscraper in the mountains is effectively impossible.",
    };
  }
  if (terrain === "hills" && type === "skyscraper" && mult >= 30) {
    // Allowed but insanely expensive — keep allowed true
  }
  return {
    allowed: true,
    costCents: Math.round(def.baseCostCents * mult),
    multiplier: mult,
  };
}
