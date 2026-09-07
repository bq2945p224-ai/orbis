-- Phase 2: personal life — banking, skills, jobs, travel

CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "currency" varchar(8) DEFAULT 'ORB' NOT NULL,
  "balance_cents" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_character_uidx" ON "bank_accounts" ("character_id");

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "from_account_id" uuid REFERENCES "bank_accounts"("id"),
  "to_account_id" uuid REFERENCES "bank_accounts"("id"),
  "amount_cents" bigint NOT NULL,
  "currency" varchar(8) DEFAULT 'ORB' NOT NULL,
  "reason" varchar(64) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotency_uidx" ON "ledger_entries" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "ledger_entries_from_idx" ON "ledger_entries" ("from_account_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_to_idx" ON "ledger_entries" ("to_account_id");

CREATE TABLE IF NOT EXISTS "skill_definitions" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "character_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "skill_key" varchar(64) NOT NULL REFERENCES "skill_definitions"("key"),
  "level" integer DEFAULT 0 NOT NULL,
  "experience" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_skills_unique_uidx" ON "character_skills" ("character_id","skill_key");
CREATE INDEX IF NOT EXISTS "character_skills_character_idx" ON "character_skills" ("character_id");

CREATE TABLE IF NOT EXISTS "employers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "job_postings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employer_id" uuid NOT NULL REFERENCES "employers"("id") ON DELETE cascade,
  "title" varchar(128) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "required_skill_key" varchar(64) REFERENCES "skill_definitions"("key"),
  "required_skill_level" integer DEFAULT 0 NOT NULL,
  "salary_cents_per_day" integer NOT NULL,
  "open" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "job_postings_employer_idx" ON "job_postings" ("employer_id");

CREATE TABLE IF NOT EXISTS "employments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "employer_id" uuid NOT NULL REFERENCES "employers"("id"),
  "job_posting_id" uuid REFERENCES "job_postings"("id") ON DELETE set null,
  "title" varchar(128) NOT NULL,
  "salary_cents_per_day" integer NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz,
  "end_reason" varchar(64)
);
CREATE INDEX IF NOT EXISTS "employments_character_idx" ON "employments" ("character_id");
CREATE UNIQUE INDEX IF NOT EXISTS "employments_one_active_uidx" ON "employments" ("character_id") WHERE "ended_at" IS NULL;

CREATE TABLE IF NOT EXISTS "travel_trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "from_district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "to_district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "cost_cents" integer NOT NULL,
  "departed_at" timestamptz NOT NULL,
  "arrives_at" timestamptz NOT NULL,
  "status" varchar(16) DEFAULT 'in_transit' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "travel_trips_character_idx" ON "travel_trips" ("character_id");
CREATE INDEX IF NOT EXISTS "travel_trips_status_arrives_idx" ON "travel_trips" ("status","arrives_at");
