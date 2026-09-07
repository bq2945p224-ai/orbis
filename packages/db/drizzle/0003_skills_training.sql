-- Skills: time-based training, unlock on interaction

ALTER TABLE "character_skills"
  ADD COLUMN IF NOT EXISTS "progress_ms" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "character_skills"
  ADD COLUMN IF NOT EXISTS "unlocked_at" timestamptz DEFAULT now() NOT NULL;

-- Wipe auto-granted starter skills so only unlocked skills remain
DELETE FROM "character_skills";

CREATE TABLE IF NOT EXISTS "skill_training_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
  "skill_key" varchar(64) NOT NULL REFERENCES "skill_definitions"("key"),
  "mode" varchar(32) NOT NULL,
  "from_level" integer NOT NULL,
  "to_level" integer NOT NULL,
  "cost_cents" integer DEFAULT 0 NOT NULL,
  "started_at" timestamptz NOT NULL,
  "completes_at" timestamptz NOT NULL,
  "status" varchar(16) DEFAULT 'in_progress' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "skill_training_sessions_character_idx"
  ON "skill_training_sessions" ("character_id");
CREATE INDEX IF NOT EXISTS "skill_training_sessions_status_completes_idx"
  ON "skill_training_sessions" ("status", "completes_at");
CREATE UNIQUE INDEX IF NOT EXISTS "skill_training_one_active_uidx"
  ON "skill_training_sessions" ("character_id")
  WHERE "status" = 'in_progress';
