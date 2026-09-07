-- Phase 1 foundation schema
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "email_verified_at" timestamptz,
  "password_hash" text NOT NULL,
  "username" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_lower_uidx" ON "accounts" (lower("email"));
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_username_lower_uidx" ON "accounts" (lower("username"));

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "token_hash" varchar(128) NOT NULL,
  "ip" "inet",
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_uidx" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_account_id_idx" ON "sessions" ("account_id");

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "email" varchar(320) NOT NULL,
  "ip" "inet",
  "success" boolean NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "login_attempts_email_created_idx" ON "login_attempts" ("email","created_at");
CREATE INDEX IF NOT EXISTS "login_attempts_ip_created_idx" ON "login_attempts" ("ip","created_at");

CREATE TABLE IF NOT EXISTS "account_security_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "type" varchar(64) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_security_events_account_idx" ON "account_security_events" ("account_id","created_at");

CREATE TABLE IF NOT EXISTS "ip_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "ip" "inet" NOT NULL,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "count" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ip_observations_account_ip_uidx" ON "ip_observations" ("account_id","ip");
CREATE INDEX IF NOT EXISTS "ip_observations_ip_idx" ON "ip_observations" ("ip");
CREATE INDEX IF NOT EXISTS "ip_observations_account_idx" ON "ip_observations" ("account_id");

CREATE TABLE IF NOT EXISTS "shared_ip_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_a_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "account_b_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "evidence_strength" integer DEFAULT 1 NOT NULL,
  "last_detected_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shared_ip_links_pair_uidx" ON "shared_ip_links" ("account_a_id","account_b_id");
CREATE INDEX IF NOT EXISTS "shared_ip_links_a_idx" ON "shared_ip_links" ("account_a_id");
CREATE INDEX IF NOT EXISTS "shared_ip_links_b_idx" ON "shared_ip_links" ("account_b_id");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "token_hash" varchar(128) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_hash_uidx" ON "email_verification_tokens" ("token_hash");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "token_hash" varchar(128) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_hash_uidx" ON "password_reset_tokens" ("token_hash");

CREATE TABLE IF NOT EXISTS "countries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(8) NOT NULL UNIQUE,
  "name" varchar(128) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "regions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id") ON DELETE cascade,
  "code" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "region_id" uuid NOT NULL REFERENCES "regions"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "districts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id" uuid NOT NULL REFERENCES "cities"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "land_parcels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "region_id" uuid NOT NULL REFERENCES "regions"("id"),
  "city_id" uuid NOT NULL REFERENCES "cities"("id"),
  "district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "geom" geometry(Polygon, 4326) NOT NULL,
  "area_m2" integer NOT NULL,
  "land_type" varchar(64) DEFAULT 'urban' NOT NULL,
  "zoning" varchar(64),
  "label" varchar(128),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "land_parcels_district_idx" ON "land_parcels" ("district_id");
CREATE INDEX IF NOT EXISTS "land_parcels_city_idx" ON "land_parcels" ("city_id");
CREATE INDEX IF NOT EXISTS "land_parcels_geom_gix" ON "land_parcels" USING GIST ("geom");

CREATE TABLE IF NOT EXISTS "characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'alive' NOT NULL,
  "location_district_id" uuid REFERENCES "districts"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "died_at" timestamptz,
  "cause_of_death" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "characters_one_alive_per_account_uidx" ON "characters" ("account_id") WHERE "status" = 'alive';
CREATE INDEX IF NOT EXISTS "characters_account_idx" ON "characters" ("account_id");
CREATE INDEX IF NOT EXISTS "characters_location_idx" ON "characters" ("location_district_id");

CREATE TABLE IF NOT EXISTS "world_clock" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "sim_time" timestamptz DEFAULT now() NOT NULL,
  "last_tick_at" timestamptz DEFAULT now() NOT NULL,
  "tick_version" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "world_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(64) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_character_id" uuid REFERENCES "characters"("id") ON DELETE set null,
  "subject_type" varchar(64),
  "subject_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "sim_time" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "world_events_type_created_idx" ON "world_events" ("type","created_at");
CREATE INDEX IF NOT EXISTS "world_events_subject_idx" ON "world_events" ("subject_type","subject_id");

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" varchar(64) NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "ip" "inet",
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_log_action_created_idx" ON "audit_log" ("action","created_at");
CREATE INDEX IF NOT EXISTS "audit_log_account_idx" ON "audit_log" ("account_id");

CREATE TABLE IF NOT EXISTS "outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "world_events"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "published_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "outbox_unpublished_idx" ON "outbox" ("published_at","created_at");
