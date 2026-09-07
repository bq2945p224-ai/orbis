/** Real-world ground travel speeds (average, including stops). */
export const WALK_SPEED_KMH = 5;
/** Mixed urban/rural driving average until a road network exists. */
export const DRIVE_SPEED_KMH = 45;
/** Path length vs straight-line distance. */
export const WALK_PATH_FACTOR = 1.15;
export const DRIVE_PATH_FACTOR = 1.35;
/** Fuel / wear cost while driving (cents per road-km). Walking is free. */
export const DRIVE_CENTS_PER_KM = 25;

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GroundTravelMode = "walk" | "drive";

export function quoteGroundTravel(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  hasVehicle: boolean;
}): {
  mode: GroundTravelMode;
  straightLineM: number;
  distanceM: number;
  durationMs: number;
  costCents: number;
  speedKmh: number;
} {
  const straightLineM = haversineMeters(
    input.fromLat,
    input.fromLng,
    input.toLat,
    input.toLng,
  );
  const mode: GroundTravelMode = input.hasVehicle ? "drive" : "walk";
  const factor = mode === "drive" ? DRIVE_PATH_FACTOR : WALK_PATH_FACTOR;
  const distanceM = Math.max(1, Math.round(straightLineM * factor));
  const speedKmh = mode === "drive" ? DRIVE_SPEED_KMH : WALK_SPEED_KMH;
  const durationMs = Math.max(60_000, Math.round((distanceM / 1000 / speedKmh) * 3_600_000));
  const costCents =
    mode === "drive" ? Math.max(0, Math.round((distanceM / 1000) * DRIVE_CENTS_PER_KM)) : 0;

  return { mode, straightLineM: Math.round(straightLineM), distanceM, durationMs, costCents, speedKmh };
}

export function formatTravelDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) return mins ? `${hours} h ${mins} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days} d ${remH} h` : `${days} d`;
}
