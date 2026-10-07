-- Run with the application stopped: existing pagination cursors must be reloaded
-- after the chronological merge. Message IDs, turn IDs and operation links survive.
ALTER TABLE message
  ADD COLUMN pdf_material_id uuid REFERENCES material(id) ON DELETE SET NULL,
  ADD COLUMN pdf_page_id uuid,
  ADD COLUMN pdf_explanation_id uuid;
CREATE UNIQUE INDEX message_pdf_turn_once ON message(pdf_material_id,pdf_explanation_id,role)
  WHERE pdf_material_id IS NOT NULL AND pdf_explanation_id IS NOT NULL;
CREATE INDEX message_pdf_context ON message(owner_id,conversation_id,pdf_material_id)
  WHERE pdf_material_id IS NOT NULL;

CREATE TEMP TABLE pdf_message_import ON COMMIT DROP AS
SELECT DISTINCT ON (t.material_id,t.explanation_id,t.role)
  t.*,m.owner_id,m.conversation_id,m.version AS material_version,
  COALESCE((SELECT u.id FROM pdf_study_turn u WHERE u.material_id=t.material_id
    AND u.explanation_id=t.explanation_id AND u.role='user' ORDER BY u.created_at,u.id LIMIT 1),t.id) AS canonical_turn_id
FROM pdf_study_turn t JOIN material m ON m.id=t.material_id
JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM message existing WHERE existing.id=t.id OR
    (existing.pdf_material_id=t.material_id AND existing.pdf_explanation_id=t.explanation_id AND existing.role=t.role))
ORDER BY t.material_id,t.explanation_id,t.role,t.created_at,t.id;

INSERT INTO message(id,owner_id,conversation_id,sequence,role,content,state,turn_id,
  personality_snapshot,personality_version_snapshot,source_snapshot,skill_snapshot,
  skill_version_snapshot,response_depth_snapshot,created_at,prompt_version,
  pdf_material_id,pdf_page_id,pdf_explanation_id)
SELECT imported.id,imported.owner_id,imported.conversation_id,
  (COALESCE((SELECT max(sequence) FROM message existing WHERE existing.conversation_id=imported.conversation_id),0)
   + row_number() OVER (PARTITION BY imported.conversation_id ORDER BY imported.created_at,imported.material_id,
      imported.explanation_id,CASE imported.role WHEN 'user' THEN 0 ELSE 1 END,imported.id))::integer,
  imported.role,imported.content,'completed',imported.canonical_turn_id,
  'objetiva',2,jsonb_build_array(jsonb_build_object('id',imported.material_id,'version',imported.material_version)),
  'explicar',1,'aprofundada',imported.created_at,'pdf-study-legacy-import',
  imported.material_id,imported.page_id,imported.explanation_id
FROM pdf_message_import imported;

CREATE TEMP TABLE pdf_message_order ON COMMIT DROP AS
WITH turns AS (
  SELECT m.conversation_id,m.turn_id,min(m.created_at) AS turn_time,min(m.sequence) AS turn_order
  FROM message m WHERE m.conversation_id IN (SELECT conversation_id FROM pdf_message_import)
  GROUP BY m.conversation_id,m.turn_id
)
SELECT m.id,m.conversation_id,
  row_number() OVER (PARTITION BY m.conversation_id ORDER BY t.turn_time,t.turn_order,
    CASE m.role WHEN 'user' THEN 0 ELSE 1 END,m.sequence,m.id)::integer AS sequence
FROM message m JOIN turns t ON t.conversation_id=m.conversation_id AND t.turn_id=m.turn_id;

-- Move all old positions above both existing positions and new ranks before
-- assigning the new positive ranks; never transiently violate the unique key.
WITH offsets AS (
  SELECT m.conversation_id,max(m.sequence)::bigint+count(*)+1 AS amount FROM message m
  WHERE m.conversation_id IN (SELECT conversation_id FROM pdf_message_import) GROUP BY m.conversation_id
)
UPDATE message m SET sequence=(m.sequence+offsets.amount)::integer
FROM offsets WHERE offsets.conversation_id=m.conversation_id;
UPDATE message m SET sequence=ordered.sequence FROM pdf_message_order ordered WHERE ordered.id=m.id;
UPDATE conversation SET version=version+1 WHERE id IN (SELECT conversation_id FROM pdf_message_import);
