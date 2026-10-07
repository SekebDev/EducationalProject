CREATE TABLE pdf_study (
  material_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  editor_state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id,material_id) REFERENCES material(owner_id,id) ON DELETE CASCADE,
  UNIQUE (owner_id,material_id)
);
CREATE TABLE pdf_study_operation (
  material_id uuid NOT NULL REFERENCES pdf_study(material_id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  revision integer NOT NULL,
  before_state jsonb,
  after_state jsonb,
  kind text NOT NULL CHECK (kind IN ('edit','tutor','undo','redo')),
  undone boolean NOT NULL DEFAULT false,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id,operation_id)
);
CREATE INDEX pdf_study_history ON pdf_study_operation(material_id,revision DESC) WHERE before_state IS NOT NULL;
CREATE TABLE pdf_study_turn (
  id uuid PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES pdf_study(material_id) ON DELETE CASCADE,
  explanation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  page_id uuid NOT NULL,
  basis text NOT NULL CHECK (basis IN ('source','general','unsupported')),
  cited_page_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
