-- Significant personal assets (vehicles, art, jewelry, …) — not petty inventory

CREATE TABLE IF NOT EXISTS "asset_definitions" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "category" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "base_value_cents" integer NOT NULL DEFAULT 0,
  "tradable" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "character_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "asset_key" varchar(64) NOT NULL REFERENCES "asset_definitions"("key"),
  "title" varchar(128) NOT NULL,
  "estimated_value_cents" integer NOT NULL DEFAULT 0,
  "quantity" integer NOT NULL DEFAULT 1,
  "condition" integer NOT NULL DEFAULT 100,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "acquired_at" timestamptz NOT NULL DEFAULT now(),
  "acquired_how" varchar(32) NOT NULL DEFAULT 'purchase'
);

CREATE INDEX IF NOT EXISTS "character_assets_character_idx"
  ON "character_assets" ("character_id");
CREATE INDEX IF NOT EXISTS "character_assets_category_idx"
  ON "character_assets" ("asset_key");

CREATE TABLE IF NOT EXISTS "asset_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_key" varchar(64) NOT NULL REFERENCES "asset_definitions"("key"),
  "seller_character_id" uuid REFERENCES "characters"("id") ON DELETE set null,
  "title" varchar(128) NOT NULL,
  "price_cents" integer NOT NULL,
  "open" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "asset_listings_open_idx"
  ON "asset_listings" ("open");
