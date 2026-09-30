ALTER TABLE message
ADD COLUMN personality_version_snapshot integer NOT NULL DEFAULT 1
CHECK (personality_version_snapshot > 0);
