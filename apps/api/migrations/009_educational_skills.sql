ALTER TABLE conversation
  ADD COLUMN skill_key text NOT NULL DEFAULT 'explicar'
    CHECK (skill_key IN ('explicar', 'praticar', 'revisar', 'flashcards')),
  ADD COLUMN response_depth text NOT NULL DEFAULT 'aprofundada'
    CHECK (response_depth IN ('resumida', 'equilibrada', 'aprofundada'));

ALTER TABLE message
  ADD COLUMN skill_snapshot text NOT NULL DEFAULT 'explicar'
    CHECK (skill_snapshot IN ('explicar', 'praticar', 'revisar', 'flashcards')),
  ADD COLUMN skill_version_snapshot integer NOT NULL DEFAULT 1
    CHECK (skill_version_snapshot > 0),
  ADD COLUMN response_depth_snapshot text NOT NULL DEFAULT 'aprofundada'
    CHECK (response_depth_snapshot IN ('resumida', 'equilibrada', 'aprofundada'));
