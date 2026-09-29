ALTER TABLE recommendation ADD COLUMN fingerprint text;
UPDATE recommendation SET fingerprint = id::text;
ALTER TABLE recommendation ALTER COLUMN fingerprint SET NOT NULL;
CREATE UNIQUE INDEX recommendation_owner_fingerprint ON recommendation(owner_id, fingerprint);
