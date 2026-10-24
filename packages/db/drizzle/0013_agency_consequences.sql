-- Structured law effects so legislation can change simulation rules.
ALTER TABLE "laws"
  ADD COLUMN IF NOT EXISTS "effect_key" varchar(64),
  ADD COLUMN IF NOT EXISTS "effect_value" integer;

CREATE INDEX IF NOT EXISTS "laws_country_effect_idx"
  ON "laws" ("country_id", "effect_key")
  WHERE "active" = true AND "effect_key" IS NOT NULL;
