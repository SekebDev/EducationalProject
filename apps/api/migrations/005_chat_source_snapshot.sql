ALTER TABLE message
  ADD COLUMN source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
