-- Additive, optional accounting for explicitly budgeted staging/evaluation runs.
-- No prompts, credentials, student answers or public API access.
CREATE TABLE ai_run_budget (
  id uuid PRIMARY KEY,
  max_micro_usd bigint NOT NULL CHECK (max_micro_usd > 0),
  spent_micro_usd bigint NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  prices jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_call_reservation (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES ai_run_budget(id),
  model text NOT NULL,
  schema_name text NOT NULL,
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd >= 0),
  charged_micro_usd bigint,
  input_tokens bigint,
  output_tokens bigint,
  state text NOT NULL CHECK (state IN ('reserved','measured','unknown_usage')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_call_reservation_run ON ai_call_reservation(run_id, state);
