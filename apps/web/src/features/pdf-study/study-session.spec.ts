import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudySession,
  persistStudySession,
  sessionOwnsOperation,
  type StudyOperation,
} from './study-session';
import { writeStudyDraft } from './study-drafts';

vi.mock('./study-drafts', () => ({
  writeStudyDraft: vi.fn(async () => undefined),
}));

describe('study session asynchronous ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the captured owner key even when navigation happens before a deferred write', async () => {
    const session = createStudySession();
    session.key = 'owner:material-a';
    let release!: () => void;
    session.writes = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writing = persistStudySession(session);
    session.key = 'owner:material-b';
    release();
    await writing;
    expect(writeStudyDraft).toHaveBeenCalledWith('owner:material-a', {
      queue: [],
      tutor: null,
    });
  });

  it('prevents an aborted tutor operation from owning the replacement cancellation lock', () => {
    const session = createStudySession();
    session.active = true;
    session.generation = 1;
    const ask: StudyOperation = {
      token: Symbol('ask'),
      generation: 1,
      kind: 'ask',
    };
    const cancel: StudyOperation = {
      token: Symbol('cancel'),
      generation: 1,
      kind: 'cancel',
    };
    session.operation = ask;
    expect(sessionOwnsOperation(session, ask)).toBe(true);
    session.operation = cancel;
    expect(sessionOwnsOperation(session, ask)).toBe(false);
    expect(sessionOwnsOperation(session, cancel)).toBe(true);
  });

  it('ignores work from a previous StrictMode mount and from an unmounted material', () => {
    const session = createStudySession();
    session.active = true;
    session.generation = 1;
    const operation: StudyOperation = {
      token: Symbol('load'),
      generation: 1,
      kind: 'load',
    };
    session.operation = operation;
    session.generation = 2;
    expect(sessionOwnsOperation(session, operation)).toBe(false);
    session.generation = 1;
    session.active = false;
    expect(sessionOwnsOperation(session, operation)).toBe(false);
  });
});
