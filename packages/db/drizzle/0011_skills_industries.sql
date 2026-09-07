ALTER TABLE "skill_definitions"
  ADD COLUMN IF NOT EXISTS "category" varchar(64) NOT NULL DEFAULT 'general';

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "industry" varchar(64) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "primary_skill_key" varchar(64) REFERENCES "skill_definitions"("key");

UPDATE "companies"
SET "primary_skill_key" = 'management'
WHERE "primary_skill_key" IS NULL
  AND EXISTS (SELECT 1 FROM "skill_definitions" WHERE "key" = 'management');
