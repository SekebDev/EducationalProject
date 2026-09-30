import type { PersonalityKey } from '../personalities.js';

export type ConversationEntity = {
  id: string;
  title: string;
  personality_key: PersonalityKey;
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
  references_json: unknown;
  operation_id: string | null;
};
