CREATE TABLE pdf_tutor_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  material_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id,material_id) REFERENCES pdf_study(owner_id,material_id) ON DELETE CASCADE
);
CREATE INDEX pdf_tutor_attempt_owner_time ON pdf_tutor_attempt(owner_id,created_at DESC);
