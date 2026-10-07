-- Execute no banco restaurado, antes de abrir o tráfego e de iniciar o worker.
-- deletion_record deve ter sido importada do journal mais recente.
BEGIN;
-- A journal marked purged refers to the original database, not this restored copy.
UPDATE deletion_record SET purge_state='pending',purged_at=NULL;
UPDATE conversation c SET deleted_at=d.deleted_at,version=c.version+1
  FROM deletion_record d WHERE d.resource_type='conversation' AND d.resource_id=c.id AND d.owner_id=c.owner_id
  AND c.deleted_at IS NULL;
UPDATE material m SET deleted_at=d.deleted_at,version=m.version+1
  FROM deletion_record d WHERE d.resource_type='material' AND d.resource_id=m.id AND d.owner_id=m.owner_id
  AND m.deleted_at IS NULL;
UPDATE material m SET deleted_at=c.deleted_at,version=m.version+1
  FROM conversation c WHERE m.conversation_id=c.id AND m.owner_id=c.owner_id
  AND c.deleted_at IS NOT NULL AND m.deleted_at IS NULL;
INSERT INTO deletion_record(owner_id,resource_type,resource_id,deleted_at,purge_state)
  SELECT owner_id,'material',id,deleted_at,'pending' FROM material WHERE deleted_at IS NOT NULL
  ON CONFLICT(resource_type,resource_id) DO NOTHING;
UPDATE exam e SET deleted_at=d.deleted_at FROM deletion_record d
  WHERE d.resource_type='exam' AND d.resource_id=e.id AND d.owner_id=e.owner_id AND e.deleted_at IS NULL;
UPDATE attempt a SET deleted_at=d.deleted_at,version=a.version+1 FROM deletion_record d
  WHERE d.resource_type='attempt' AND d.resource_id=a.id AND d.owner_id=a.owner_id AND a.deleted_at IS NULL;
UPDATE exam_source es SET available=false FROM material m
  WHERE es.owner_id=m.owner_id AND es.material_id=m.id AND m.deleted_at IS NOT NULL;
UPDATE exam e SET context_snapshot=NULL FROM conversation c
  WHERE e.owner_id=c.owner_id AND e.conversation_id=c.id AND c.deleted_at IS NOT NULL;
UPDATE operation o SET state='cancelled',phase='cancelled',fence_version=o.fence_version+1,
  lease_until=NULL,updated_at=now()
  WHERE o.state IN ('pending','running') AND (
    EXISTS(SELECT 1 FROM material m WHERE m.owner_id=o.owner_id AND m.id=o.resource_id AND m.deleted_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM exam e WHERE e.owner_id=o.owner_id AND e.id=o.resource_id AND e.deleted_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id WHERE a.owner_id=o.owner_id AND a.id=o.resource_id AND att.deleted_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM message m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id WHERE m.owner_id=o.owner_id AND m.id=o.resource_id AND c.deleted_at IS NOT NULL)
  );
COMMIT;
