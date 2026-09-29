ALTER TABLE exam_topic ADD COLUMN ordinal integer;
WITH ordered AS (
  SELECT exam_id,topic_id,row_number() OVER (PARTITION BY exam_id ORDER BY topic_id) AS position
  FROM exam_topic
)
UPDATE exam_topic et SET ordinal=ordered.position
FROM ordered WHERE et.exam_id=ordered.exam_id AND et.topic_id=ordered.topic_id;
ALTER TABLE exam_topic ALTER COLUMN ordinal SET NOT NULL;
ALTER TABLE exam_topic ADD CONSTRAINT exam_topic_ordinal_positive CHECK (ordinal > 0);
ALTER TABLE exam_topic ADD CONSTRAINT exam_topic_order_unique UNIQUE (exam_id,ordinal);
