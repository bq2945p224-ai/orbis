-- Ground travel: character coordinates, trip routing fields, building addresses

ALTER TABLE "characters"
  ADD COLUMN IF NOT EXISTS "latitude" double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision;

ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "address" varchar(256);

ALTER TABLE "travel_trips"
  ADD COLUMN IF NOT EXISTS "mode" varchar(16) NOT NULL DEFAULT 'walk',
  ADD COLUMN IF NOT EXISTS "from_lat" double precision,
  ADD COLUMN IF NOT EXISTS "from_lng" double precision,
  ADD COLUMN IF NOT EXISTS "to_lat" double precision,
  ADD COLUMN IF NOT EXISTS "to_lng" double precision,
  ADD COLUMN IF NOT EXISTS "distance_m" integer,
  ADD COLUMN IF NOT EXISTS "destination_label" varchar(256),
  ADD COLUMN IF NOT EXISTS "to_building_id" uuid REFERENCES "buildings"("id") ON DELETE set null;

-- Backfill character positions from city of current district
UPDATE "characters" c
SET
  latitude = city.latitude,
  longitude = city.longitude
FROM "districts" d
JOIN "cities" city ON city.id = d.city_id
WHERE c.location_district_id = d.id
  AND (c.latitude IS NULL OR c.longitude IS NULL);

-- Backfill building addresses from name + district/city
UPDATE "buildings" b
SET address = concat_ws(', ', b.name, d.name, c.name)
FROM "land_parcels" lp
JOIN "districts" d ON d.id = lp.district_id
JOIN "cities" c ON c.id = d.city_id
WHERE b.parcel_id = lp.id
  AND (b.address IS NULL OR b.address = '');
