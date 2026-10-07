export type AttemptEntity = {
  id: string;
  exam_id: string;
  state: string;
  version: number;
  submitted_at: Date | null;
};

export type AnswerEntity = {
  id: string;
  question_id: string;
  draft_value: string | null;
  draft_version: number;
  confirmed_value: string | null;
  confirmed_at: Date | null;
  state: string;
};

export type QuestionEntity = {
  id: string;
  ordinal: number;
  type: 'objective' | 'essay';
  statement: string;
  alternatives: Array<{ id: string; text: string }> | null;
  topic: string;
  study_level_snapshot: string;
};
