-- Phases 3–13: property, companies, social, orgs, politics, markets, health, international, military, crime

CREATE TABLE IF NOT EXISTS "system_accounts" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "balance_cents" bigint DEFAULT 0 NOT NULL,
  "currency" varchar(8) DEFAULT 'ORB' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Phase 3: Property
CREATE TABLE IF NOT EXISTS "parcel_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" uuid NOT NULL REFERENCES "land_parcels"("id") ON DELETE cascade,
  "seller_character_id" uuid REFERENCES "characters"("id") ON DELETE set null,
  "price_cents" integer NOT NULL,
  "open" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "parcel_listings_parcel_idx" ON "parcel_listings" ("parcel_id");

CREATE TABLE IF NOT EXISTS "parcel_ownerships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" uuid NOT NULL REFERENCES "land_parcels"("id") ON DELETE cascade,
  "owner_character_id" uuid REFERENCES "characters"("id") ON DELETE set null,
  "owner_company_id" uuid,
  "acquired_at" timestamptz DEFAULT now() NOT NULL,
  "acquisition" varchar(32) DEFAULT 'purchase' NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "parcel_ownerships_parcel_uidx" ON "parcel_ownerships" ("parcel_id");
CREATE INDEX IF NOT EXISTS "parcel_ownerships_owner_char_idx" ON "parcel_ownerships" ("owner_character_id");

CREATE TABLE IF NOT EXISTS "buildings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" uuid NOT NULL REFERENCES "land_parcels"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "building_type" varchar(64) DEFAULT 'structure' NOT NULL,
  "condition" integer DEFAULT 100 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "buildings_parcel_idx" ON "buildings" ("parcel_id");

CREATE TABLE IF NOT EXISTS "property_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" uuid NOT NULL REFERENCES "land_parcels"("id"),
  "from_character_id" uuid REFERENCES "characters"("id"),
  "to_character_id" uuid REFERENCES "characters"("id"),
  "price_cents" integer DEFAULT 0 NOT NULL,
  "reason" varchar(64) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "property_transfers_parcel_idx" ON "property_transfers" ("parcel_id");

-- Phase 4: Companies
CREATE TABLE IF NOT EXISTS "companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "founder_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "treasury_cents" bigint DEFAULT 0 NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "parcel_ownerships"
    ADD CONSTRAINT "parcel_ownerships_owner_company_id_companies_id_fk"
    FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "company_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "shares" integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "company_shares_unique_uidx" ON "company_shares" ("company_id","character_id");
CREATE INDEX IF NOT EXISTS "company_shares_character_idx" ON "company_shares" ("character_id");

CREATE TABLE IF NOT EXISTS "company_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "title" varchar(128) DEFAULT 'Employee' NOT NULL,
  "salary_cents_per_day" integer DEFAULT 3000 NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "company_employees_company_idx" ON "company_employees" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_employees_one_active_uidx" ON "company_employees" ("character_id") WHERE "ended_at" IS NULL;

CREATE TABLE IF NOT EXISTS "production_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "product_key" varchar(64) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "status" varchar(16) DEFAULT 'queued' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "production_orders_company_idx" ON "production_orders" ("company_id");

CREATE TABLE IF NOT EXISTS "inventories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_type" varchar(32) NOT NULL,
  "owner_id" uuid NOT NULL,
  "item_key" varchar(64) NOT NULL,
  "quantity" integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "inventories_owner_item_uidx" ON "inventories" ("owner_type","owner_id","item_key");

-- Phase 5: Social / communication
CREATE TABLE IF NOT EXISTS "character_profiles" (
  "character_id" uuid PRIMARY KEY NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "bio" text DEFAULT '' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "entity_type" varchar(64),
  "entity_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "channel_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "joined_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "channel_members_unique_uidx" ON "channel_members" ("channel_id","character_id");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "sender_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id","created_at");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "type" varchar(64) NOT NULL,
  "body" text NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_character_idx" ON "notifications" ("character_id","created_at");

CREATE TABLE IF NOT EXISTS "character_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "blocker_character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "blocked_character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_blocks_unique_uidx" ON "character_blocks" ("blocker_character_id","blocked_character_id");

CREATE TABLE IF NOT EXISTS "relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_a_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "character_b_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "kind" varchar(32) DEFAULT 'acquaintance' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_pair_uidx" ON "relationships" ("character_a_id","character_b_id");

-- Phase 6: Organizations
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "org_type" varchar(64) DEFAULT 'association' NOT NULL,
  "district_id" uuid REFERENCES "districts"("id"),
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "role" varchar(64) DEFAULT 'member' NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  "left_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "org_memberships_org_idx" ON "org_memberships" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "org_memberships_active_uidx" ON "org_memberships" ("organization_id","character_id") WHERE "left_at" IS NULL;

-- Phase 7: Politics
CREATE TABLE IF NOT EXISTS "political_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "platform" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "party_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "party_id" uuid NOT NULL REFERENCES "political_parties"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "role" varchar(32) DEFAULT 'member' NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "party_members_character_uidx" ON "party_members" ("character_id");

CREATE TABLE IF NOT EXISTS "elections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "office" varchar(64) DEFAULT 'mayor' NOT NULL,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "opens_at" timestamptz DEFAULT now() NOT NULL,
  "closes_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "candidacies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE cascade,
  "character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "party_id" uuid REFERENCES "political_parties"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "candidacies_unique_uidx" ON "candidacies" ("election_id","character_id");

CREATE TABLE IF NOT EXISTS "votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE cascade,
  "voter_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "candidate_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "votes_one_per_voter_uidx" ON "votes" ("election_id","voter_character_id");

CREATE TABLE IF NOT EXISTS "government_offices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "office" varchar(64) NOT NULL,
  "holder_character_id" uuid REFERENCES "characters"("id"),
  "since_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "government_offices_country_office_uidx" ON "government_offices" ("country_id","office");

CREATE TABLE IF NOT EXISTS "laws" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "title" varchar(128) NOT NULL,
  "body" text NOT NULL,
  "enacted_by_character_id" uuid REFERENCES "characters"("id"),
  "enacted_at" timestamptz DEFAULT now() NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);

-- Phase 8: Markets / loans / contracts
CREATE TABLE IF NOT EXISTS "market_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_character_id" uuid REFERENCES "characters"("id"),
  "seller_company_id" uuid REFERENCES "companies"("id"),
  "item_key" varchar(64) NOT NULL,
  "quantity" integer NOT NULL,
  "price_cents_each" integer NOT NULL,
  "open" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "market_listings_item_idx" ON "market_listings" ("item_key");

CREATE TABLE IF NOT EXISTS "loans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "borrower_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "principal_cents" integer NOT NULL,
  "interest_bps" integer DEFAULT 500 NOT NULL,
  "remaining_cents" integer NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "legal_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(128) NOT NULL,
  "body" text NOT NULL,
  "party_a_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "party_b_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "status" varchar(16) DEFAULT 'proposed' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Phase 9–10: Health / disease
CREATE TABLE IF NOT EXISTS "character_health" (
  "character_id" uuid PRIMARY KEY NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "hp" integer DEFAULT 100 NOT NULL,
  "max_hp" integer DEFAULT 100 NOT NULL,
  "infected_pathogen_key" varchar(64),
  "infected_at" timestamptz,
  "vaccinated_pathogen_key" varchar(64),
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "pathogens" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "transmissibility" integer DEFAULT 20 NOT NULL,
  "severity" integer DEFAULT 10 NOT NULL,
  "description" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "treatments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "kind" varchar(64) NOT NULL,
  "cost_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Phase 11: International
CREATE TABLE IF NOT EXISTS "treaties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "country_a_id" uuid NOT NULL REFERENCES "countries"("id"),
  "country_b_id" uuid NOT NULL REFERENCES "countries"("id"),
  "kind" varchar(32) DEFAULT 'peace' NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sanctions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "to_country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "reason" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Phase 12: Military
CREATE TABLE IF NOT EXISTS "military_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "name" varchar(128) NOT NULL,
  "district_id" uuid REFERENCES "districts"("id"),
  "strength" integer DEFAULT 100 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "wars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "aggressor_country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "defender_country_id" uuid NOT NULL REFERENCES "countries"("id"),
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "military_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "war_id" uuid REFERENCES "wars"("id"),
  "unit_id" uuid NOT NULL REFERENCES "military_units"("id"),
  "target_district_id" uuid REFERENCES "districts"("id"),
  "status" varchar(16) DEFAULT 'planned' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Phase 13: Crime / courts / environment / NPCs
CREATE TABLE IF NOT EXISTS "crimes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "accused_character_id" uuid NOT NULL REFERENCES "characters"("id"),
  "kind" varchar(64) NOT NULL,
  "district_id" uuid REFERENCES "districts"("id"),
  "status" varchar(16) DEFAULT 'reported' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "court_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "crime_id" uuid NOT NULL REFERENCES "crimes"("id"),
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "verdict" varchar(32),
  "fine_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "environment_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "district_id" uuid NOT NULL REFERENCES "districts"("id"),
  "pollution" integer DEFAULT 10 NOT NULL,
  "measured_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "environment_metrics_district_idx" ON "environment_metrics" ("district_id");

CREATE TABLE IF NOT EXISTS "npcs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "role" varchar(64) DEFAULT 'civilian' NOT NULL,
  "district_id" uuid REFERENCES "districts"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
