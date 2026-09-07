-- World grid (100m × 100m claimable cells) + geological resources

ALTER TABLE "land_parcels" ALTER COLUMN "country_id" DROP NOT NULL;
ALTER TABLE "land_parcels" ALTER COLUMN "region_id" DROP NOT NULL;
ALTER TABLE "land_parcels" ALTER COLUMN "city_id" DROP NOT NULL;
ALTER TABLE "land_parcels" ALTER COLUMN "district_id" DROP NOT NULL;

ALTER TABLE "land_parcels" ADD COLUMN IF NOT EXISTS "grid_ix" integer;
ALTER TABLE "land_parcels" ADD COLUMN IF NOT EXISTS "grid_iy" integer;
ALTER TABLE "land_parcels" ADD COLUMN IF NOT EXISTS "origin" varchar(32) NOT NULL DEFAULT 'urban';

CREATE UNIQUE INDEX IF NOT EXISTS "land_parcels_grid_uidx"
  ON "land_parcels" ("grid_ix", "grid_iy")
  WHERE "grid_ix" IS NOT NULL AND "grid_iy" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "resource_definitions" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "unit" varchar(32) NOT NULL DEFAULT 'tonne',
  "description" text NOT NULL DEFAULT '',
  "heatmap_color" varchar(16) NOT NULL DEFAULT '#c45c26'
);

CREATE TABLE IF NOT EXISTS "resource_deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_key" varchar(64) NOT NULL REFERENCES "resource_definitions"("key"),
  "geom" geometry(Point, 4326) NOT NULL,
  "richness" real NOT NULL DEFAULT 50,
  "radius_m" integer NOT NULL DEFAULT 25000,
  "remaining_units" bigint NOT NULL DEFAULT 1000000,
  "label" varchar(128),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "resource_deposits_geom_gix" ON "resource_deposits" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "resource_deposits_resource_idx" ON "resource_deposits" ("resource_key");
