ALTER TABLE exam ADD COLUMN conversation_id uuid;
ALTER TABLE exam ADD COLUMN context_snapshot jsonb;
ALTER TABLE exam ADD CONSTRAINT exam_conversation_owner_fk
  FOREIGN KEY (owner_id,conversation_id) REFERENCES conversation(owner_id,id);
CREATE INDEX exam_conversation_active ON exam(owner_id,conversation_id,created_at DESC)
  WHERE deleted_at IS NULL;
