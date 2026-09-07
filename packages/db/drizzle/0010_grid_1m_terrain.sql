-- 1m base grid + terrain fields for construction

ALTER TABLE "land_parcels"
  ADD COLUMN IF NOT EXISTS "grid_size_m" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "elevation_m" real,
  ADD COLUMN IF NOT EXISTS "terrain" varchar(32) NOT NULL DEFAULT 'unknown';

-- Convert legacy 100m grid indices into 1m-origin southwest corners (once).
-- Old indices were floor(mercator/100) (~|ix| < 5e5); 1m indices are ~100× larger.
UPDATE "land_parcels"
SET
  grid_ix = grid_ix * 100,
  grid_iy = grid_iy * 100,
  grid_size_m = 100
WHERE origin = 'grid'
  AND grid_ix IS NOT NULL
  AND grid_iy IS NOT NULL
  AND COALESCE(grid_size_m, 100) = 100
  AND abs(grid_ix) < 500000;

DROP INDEX IF EXISTS "land_parcels_grid_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "land_parcels_grid_block_uidx"
  ON "land_parcels" ("grid_ix", "grid_iy", "grid_size_m")
  WHERE "grid_ix" IS NOT NULL AND "grid_iy" IS NOT NULL;
