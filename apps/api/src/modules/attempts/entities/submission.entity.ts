export type ResultEntity = {
  answer_id: string;
  question_id: string;
  ordinal: number;
  type: 'objective' | 'essay';
  topic: string;
  answer_state: string | null;
  grade_state: string | null;
  points_units: number | null;
  current_revision_id: string | null;
  dispute_id: string | null;
  dispute_status: string | null;
};
