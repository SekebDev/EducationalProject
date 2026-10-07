export type ExamEntity = {
  id: string;
  title: string;
  study_level: string;
  total: number;
  objective_count: number;
  essay_count: number;
  state: string;
  generation_operation_id: string;
  conversation_id: string | null;
  context_snapshot: {
    title: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null;
  created_at: Date;
  attempt_id?: string | null;
};
