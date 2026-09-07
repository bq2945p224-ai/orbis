import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(16),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Orbis <noreply@orbis.local>"),
  REQUIRE_EMAIL_VERIFICATION: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  STARTING_BALANCE_CENTS: z.coerce.number().int().nonnegative().default(100_000),
  /**
   * Sim seconds per wall-clock second.
   * Default 6 → one game day = 4 real hours (24/4).
   */
  SIM_TIME_RATIO: z.coerce.number().positive().default(6),
  WORLD_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** Shared secret for /admin grant tools. Empty disables admin endpoints. */
  ADMIN_SECRET: z.string().optional().default(""),
  /**
   * Host platforms (Render/Fly) set PORT. Prefer PORT when present.
   */
  PORT: z.coerce.number().int().positive().optional(),
});

export type OrbisEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): OrbisEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}
