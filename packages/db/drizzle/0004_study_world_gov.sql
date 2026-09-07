-- Continuous skill study + World Government employer key

CREATE TABLE IF NOT EXISTS "character_study" (
  "character_id" uuid PRIMARY KEY NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "focus_skill_key" varchar(64) REFERENCES "skill_definitions"("key"),
  "buff_mode" varchar(32) DEFAULT 'self_study' NOT NULL,
  "buff_expires_at" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "employers"
  ADD COLUMN IF NOT EXISTS "system_key" varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "employers_system_key_uidx"
  ON "employers" ("system_key")
  WHERE "system_key" IS NOT NULL;

-- Mark land sold by the system as World Government inventory (display/API uses null seller)
UPDATE "system_accounts"
SET "key" = "key"
WHERE "key" = 'world_treasury';
