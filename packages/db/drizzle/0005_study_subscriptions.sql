-- Study buffs as recurring subscriptions (week/month)

ALTER TABLE "character_study"
  ADD COLUMN IF NOT EXISTS "buff_period" varchar(16);
ALTER TABLE "character_study"
  ADD COLUMN IF NOT EXISTS "next_billing_at" timestamptz;

-- Drop one-shot expiry semantics; keep column nullable for compatibility
UPDATE "character_study"
SET "buff_expires_at" = NULL
WHERE "buff_mode" IN ('tutoring', 'university');
