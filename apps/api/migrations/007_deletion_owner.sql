ALTER TABLE deletion_record ADD COLUMN owner_id uuid;
UPDATE deletion_record d SET owner_id = CASE d.resource_type
  WHEN 'conversation' THEN (SELECT owner_id FROM conversation WHERE id=d.resource_id)
  WHEN 'material' THEN (SELECT owner_id FROM material WHERE id=d.resource_id)
  WHEN 'exam' THEN (SELECT owner_id FROM exam WHERE id=d.resource_id)
  WHEN 'attempt' THEN (SELECT owner_id FROM attempt WHERE id=d.resource_id)
  ELSE NULL END;
CREATE INDEX deletion_pending_due ON deletion_record(deleted_at,resource_type) WHERE purge_state='pending';
