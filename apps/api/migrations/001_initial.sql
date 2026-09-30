CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student(id),
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_student_active ON session(student_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES student(id),
  title varchar(120) NOT NULL,
  personality_key text NOT NULL CHECK (personality_key IN ('acolhedora', 'objetiva', 'socratica')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (owner_id, id)
);
CREATE INDEX conversation_owner_active ON conversation(owner_id, created_at DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  state text NOT NULL CHECK (state IN ('queued', 'generating', 'completed', 'failed')),
  turn_id uuid NOT NULL,
  personality_snapshot text NOT NULL,
  references_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, conversation_id) REFERENCES conversation(owner_id, id),
  UNIQUE (conversation_id, sequence),
  UNIQUE (turn_id, role),
  UNIQUE (owner_id, id)
);

CREATE TABLE material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  original_name text NOT NULL,
  detected_mime text,
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 20000000),
  checksum text NOT NULL,
  object_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('received', 'processing', 'ready', 'failed')),
  error_code text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (owner_id, conversation_id) REFERENCES conversation(owner_id, id),
  UNIQUE (owner_id, id)
);
CREATE INDEX material_conversation_active ON material(owner_id, conversation_id) WHERE deleted_at IS NULL;

CREATE TABLE material_chunk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  material_id uuid NOT NULL,
  extraction_version integer NOT NULL CHECK (extraction_version > 0),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  text text NOT NULL,
  locator jsonb NOT NULL,
  token_count integer NOT NULL CHECK (token_count >= 0),
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, material_id) REFERENCES material(owner_id, id),
  UNIQUE (material_id, extraction_version, ordinal),
  UNIQUE (owner_id, id)
);

CREATE TABLE conversation_source (
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  material_id uuid NOT NULL,
  PRIMARY KEY (owner_id, conversation_id, material_id),
  FOREIGN KEY (owner_id, conversation_id) REFERENCES conversation(owner_id, id),
  FOREIGN KEY (owner_id, material_id) REFERENCES material(owner_id, id)
);

CREATE TABLE topic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES student(id),
  display_name varchar(200) NOT NULL,
  normalized_name varchar(200) NOT NULL,
  UNIQUE (owner_id, normalized_name),
  UNIQUE (owner_id, id)
);

CREATE TABLE operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES student(id),
  kind text NOT NULL,
  resource_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  dispatch_state text NOT NULL DEFAULT 'pending' CHECK (dispatch_state IN ('pending', 'dispatched')),
  phase text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_until timestamptz,
  fence_version integer NOT NULL DEFAULT 0 CHECK (fence_version >= 0),
  input_version integer NOT NULL DEFAULT 1,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, kind, dedupe_key),
  UNIQUE (owner_id, id)
);
CREATE INDEX operation_dispatch_pending ON operation(created_at) WHERE dispatch_state = 'pending' AND state = 'pending';

CREATE TABLE operation_event (
  operation_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, sequence),
  FOREIGN KEY (owner_id, operation_id) REFERENCES operation(owner_id, id)
);

CREATE TABLE recommendation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES student(id),
  topic_ids uuid[] NOT NULL,
  evidence_answer_ids uuid[] NOT NULL,
  evidence_revision_ids uuid[] NOT NULL,
  filter_snapshot jsonb NOT NULL,
  action text NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

CREATE TABLE exam (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES student(id),
  title varchar(120) NOT NULL,
  study_level varchar(200) NOT NULL,
  total integer NOT NULL CHECK (total BETWEEN 10 AND 30),
  objective_count integer NOT NULL CHECK (objective_count >= 0),
  essay_count integer NOT NULL CHECK (essay_count >= 0),
  state text NOT NULL CHECK (state IN ('queued', 'generating', 'ready', 'failed')),
  generation_operation_id uuid UNIQUE,
  source_recommendation_id uuid,
  origin_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (objective_count + essay_count = total),
  FOREIGN KEY (owner_id, generation_operation_id) REFERENCES operation(owner_id, id),
  FOREIGN KEY (owner_id, source_recommendation_id) REFERENCES recommendation(owner_id, id),
  UNIQUE (owner_id, id)
);

CREATE TABLE exam_topic (
  owner_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  requested_count integer NOT NULL CHECK (requested_count > 0),
  PRIMARY KEY (exam_id, topic_id),
  FOREIGN KEY (owner_id, exam_id) REFERENCES exam(owner_id, id),
  FOREIGN KEY (owner_id, topic_id) REFERENCES topic(owner_id, id)
);

CREATE TABLE exam_source (
  owner_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  material_id uuid,
  material_version integer NOT NULL CHECK (material_version > 0),
  name_snapshot text NOT NULL,
  available boolean NOT NULL DEFAULT true,
  FOREIGN KEY (owner_id, exam_id) REFERENCES exam(owner_id, id),
  FOREIGN KEY (owner_id, material_id) REFERENCES material(owner_id, id),
  UNIQUE (exam_id, material_id)
);

CREATE TABLE question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  topic_id uuid NOT NULL,
  study_level_snapshot varchar(200) NOT NULL,
  type text NOT NULL CHECK (type IN ('objective', 'essay')),
  statement text NOT NULL,
  statement_hash text NOT NULL,
  alternatives jsonb,
  source_locators jsonb NOT NULL DEFAULT '[]'::jsonb,
  FOREIGN KEY (owner_id, exam_id) REFERENCES exam(owner_id, id),
  FOREIGN KEY (owner_id, topic_id) REFERENCES topic(owner_id, id),
  UNIQUE (exam_id, ordinal),
  UNIQUE (exam_id, statement_hash),
  UNIQUE (owner_id, id)
);

CREATE TABLE question_secret (
  question_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  correct_option_id text,
  rubric jsonb,
  option_explanations jsonb,
  reference_answer text,
  schema_version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (owner_id, question_id) REFERENCES question(owner_id, id),
  CHECK ((correct_option_id IS NOT NULL AND option_explanations IS NOT NULL AND rubric IS NULL)
    OR (rubric IS NOT NULL AND reference_answer IS NOT NULL AND correct_option_id IS NULL))
);

CREATE TABLE attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  exam_id uuid NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('in_progress', 'submitted_pending', 'completed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  deleted_at timestamptz,
  FOREIGN KEY (owner_id, exam_id) REFERENCES exam(owner_id, id),
  UNIQUE (owner_id, id)
);

CREATE TABLE answer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  draft_value text,
  draft_version integer NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
  confirmed_value text,
  confirmed_at timestamptz,
  state text NOT NULL CHECK (state IN ('draft', 'confirmed_pending', 'graded', 'blank')),
  FOREIGN KEY (owner_id, attempt_id) REFERENCES attempt(owner_id, id),
  FOREIGN KEY (owner_id, question_id) REFERENCES question(owner_id, id),
  UNIQUE (attempt_id, question_id),
  UNIQUE (owner_id, id)
);

CREATE TABLE grade_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  answer_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  kind text NOT NULL CHECK (kind IN ('objective', 'essay', 'blank')),
  points_units integer NOT NULL CHECK (points_units BETWEEN 0 AND 10000),
  criterion_scores jsonb,
  explanation text NOT NULL,
  gaps jsonb,
  reference_answer text,
  model text,
  prompt_version text,
  rubric_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, answer_id) REFERENCES answer(owner_id, id),
  UNIQUE (answer_id, revision_number),
  UNIQUE (owner_id, id)
);

CREATE TABLE grade_current (
  answer_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  current_revision_id uuid,
  state text NOT NULL CHECK (state IN ('pending', 'graded', 'failed', 'contested')),
  FOREIGN KEY (owner_id, answer_id) REFERENCES answer(owner_id, id),
  FOREIGN KEY (owner_id, current_revision_id) REFERENCES grade_revision(owner_id, id)
);

CREATE TABLE dispute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  answer_id uuid NOT NULL,
  grade_revision_id uuid,
  reason varchar(2000) NOT NULL CHECK (char_length(btrim(reason)) > 0),
  status text NOT NULL CHECK (status IN ('open', 'reviewing', 'resolved')),
  resolution_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, answer_id) REFERENCES answer(owner_id, id),
  FOREIGN KEY (owner_id, grade_revision_id) REFERENCES grade_revision(owner_id, id),
  FOREIGN KEY (owner_id, resolution_revision_id) REFERENCES grade_revision(owner_id, id),
  UNIQUE (owner_id, id)
);
CREATE UNIQUE INDEX dispute_one_open ON dispute(answer_id) WHERE status IN ('open', 'reviewing');

CREATE TABLE idempotency_record (
  owner_id uuid NOT NULL REFERENCES student(id),
  route text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  resource_id uuid,
  response_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, route, key)
);

CREATE TABLE deletion_record (
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  purge_state text NOT NULL DEFAULT 'pending',
  purged_at timestamptz,
  PRIMARY KEY (resource_type, resource_id)
);
