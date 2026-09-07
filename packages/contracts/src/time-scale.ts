/** One in-game day equals this many real wall-clock hours. */
export const REAL_HOURS_PER_GAME_DAY = 4;

/** How fast sim time advances vs wall clock (24h game / 4h real = 6). */
export const SIM_TIME_RATIO = 24 / REAL_HOURS_PER_GAME_DAY;

export const GAME_DAY_MS = 24 * 60 * 60 * 1000;
export const REAL_MS_PER_GAME_DAY = REAL_HOURS_PER_GAME_DAY * 60 * 60 * 1000;
