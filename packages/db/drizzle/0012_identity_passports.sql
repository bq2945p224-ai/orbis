-- Passports, national IDs, and country residency for citizenship

ALTER TABLE "countries"
  ADD COLUMN IF NOT EXISTS "citizenship_residency_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "citizenship_requires_presence" boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "character_passports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL UNIQUE REFERENCES "characters"("id") ON DELETE CASCADE,
  "passport_number" varchar(32) NOT NULL UNIQUE,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "status" varchar(16) NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS "character_passports_character_idx" ON "character_passports" ("character_id");

CREATE TABLE IF NOT EXISTS "character_national_ids" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "country_id" uuid NOT NULL REFERENCES "countries"("id") ON DELETE CASCADE,
  "document_number" varchar(32) NOT NULL UNIQUE,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "issued_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_national_ids_one_per_country_uidx"
  ON "character_national_ids" ("character_id", "country_id");
CREATE INDEX IF NOT EXISTS "character_national_ids_character_idx"
  ON "character_national_ids" ("character_id");

CREATE TABLE IF NOT EXISTS "character_country_presence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
  "country_id" uuid NOT NULL REFERENCES "countries"("id") ON DELETE CASCADE,
  "first_entered_at" timestamptz NOT NULL DEFAULT now(),
  "presence_started_at" timestamptz,
  "last_left_at" timestamptz,
  "accumulated_ms" bigint NOT NULL DEFAULT 0,
  "currently_present" boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_country_presence_uidx"
  ON "character_country_presence" ("character_id", "country_id");
CREATE INDEX IF NOT EXISTS "character_country_presence_character_idx"
  ON "character_country_presence" ("character_id");
