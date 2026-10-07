import type { PersonalityKey } from '../personalities.js';
import type { EducationalSkill, ResponseDepth } from '@study/contracts';

export type ConversationEntity = {
  id: string;
  title: string;
  personality_key: PersonalityKey;
  skill_key: EducationalSkill;
  response_depth: ResponseDepth;
  version: number;
  created_at: Date;
};

export type MessageEntity = {
  id: string;
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  state: string;
  personality_snapshot: PersonalityKey;
  skill_snapshot: EducationalSkill;
  skill_version_snapshot: number;
  response_depth_snapshot: ResponseDepth;
  references_json: unknown;
  operation_id: string | null;
  pdf_material_id: string | null;
  pdf_page_id: string | null;
  pdf_explanation_id: string | null;
};
