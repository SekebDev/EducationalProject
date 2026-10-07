import type { PdfStudy } from '@study/contracts';
import { writeStudyDraft, type StudyDraft } from './study-drafts';

export type StudyOperation = {
  token: symbol;
  generation: number;
  kind: 'load' | 'history' | 'ask' | 'cancel' | 'reload' | 'advance';
};
export type StudySession = {
  active: boolean;
  generation: number;
  key: string;
  server: PdfStudy | null;
  draft: StudyDraft;
  writes: Promise<void>;
  flushing: Promise<boolean> | null;
  operation: StudyOperation | null;
  controller: AbortController | null;
  asking: Promise<void> | null;
};
export function createStudySession(): StudySession {
  return {
    active: false,
    generation: 0,
    key: '',
    server: null,
    draft: { queue: [], tutor: null },
    writes: Promise.resolve(),
    flushing: null,
    operation: null,
    controller: null,
    asking: null,
  };
}
export function persistStudySession(session: StudySession): Promise<void> {
  const value = structuredClone(session.draft);
  const key = session.key;
  if (!key) {
    return Promise.reject(new Error('O caderno ainda está carregando.'));
  }
  session.writes = session.writes
    .catch(() => undefined)
    .then(() => writeStudyDraft(key, value));
  return session.writes;
}
export function sessionOwnsOperation(
  session: StudySession,
  operation: StudyOperation,
): boolean {
  return (
    session.active &&
    session.generation === operation.generation &&
    session.operation === operation
  );
}
