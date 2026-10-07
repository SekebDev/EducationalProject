-- Quota belongs to the account/time window and must survive deleting its source PDF.
ALTER TABLE pdf_tutor_attempt DROP CONSTRAINT pdf_tutor_attempt_owner_id_material_id_fkey;
ALTER TABLE pdf_tutor_attempt ALTER COLUMN material_id DROP NOT NULL;
ALTER TABLE pdf_tutor_attempt ADD CONSTRAINT pdf_tutor_attempt_owner_id_material_id_fkey
  FOREIGN KEY (owner_id,material_id) REFERENCES pdf_study(owner_id,material_id)
  ON DELETE SET NULL (material_id);

-- Keep replay payloads bounded for existing studies as well as new writes.
UPDATE pdf_study_operation o SET response='null'::jsonb
  FROM pdf_study s WHERE s.material_id=o.material_id AND o.revision<=s.revision-30;
