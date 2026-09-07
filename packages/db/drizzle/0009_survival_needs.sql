-- Survival needs: hunger/thirst/energy + biomes for local food/water availability

ALTER TABLE "character_health"
  ADD COLUMN IF NOT EXISTS "hunger" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "thirst" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "energy" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "max_hunger" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "max_thirst" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "max_energy" integer NOT NULL DEFAULT 100;

ALTER TABLE "cities"
  ADD COLUMN IF NOT EXISTS "biome" varchar(32) NOT NULL DEFAULT 'temperate';

ALTER TABLE "districts"
  ADD COLUMN IF NOT EXISTS "has_market" boolean NOT NULL DEFAULT true;

-- Deserts and remote outposts: no local food/water market by default
UPDATE "districts" SET has_market = false
WHERE name ILIKE '%desert%' OR name ILIKE '%sahara%' OR name ILIKE '%outpost%';
