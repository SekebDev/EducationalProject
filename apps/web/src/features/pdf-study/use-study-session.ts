'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PdfStudy,
  StudyEditorState,
  StudyQuestion,
} from '@study/contracts';
import { api, apiStream, errorMessage, RequestError } from '../../lib/api';
import { readStudyDraft } from './study-drafts';
import {
  createStudySession,
  persistStudySession,
  sessionOwnsOperation,
  type StudyOperation,
} from './study-session';

type TutorEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'complete';
      study: PdfStudy;
      annotationIds: string[];
      pageIds: string[];
    }
  | { type: 'error'; code: string; message: string };
export function useStudyProject(
  materialId: string,
  onTutorActions: (ids: string[], pages: string[], study: PdfStudy) => void,
) {
  const [study, setStudy] = useState<PdfStudy | null>(null);
  const [state, setState] = useState<StudyEditorState | null>(null);
  const [status, setStatus] = useState('Carregando…');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [conflict, setConflict] = useState(false);
  const [retryQuestion, setRetryQuestion] = useState<StudyQuestion | null>(
    null,
  );
  const session = useMemo(createStudySession, [materialId]);
  const current = useRef(session);
  current.current = session;
  const actions = useRef(onTutorActions);
  actions.current = onTutorActions;
  const live = useCallback(
    (generation: number) =>
      current.current === session &&
      session.active &&
      session.generation === generation,
    [session],
  );
  const accept = useCallback(
    (next: PdfStudy, generation: number) => {
      if (!live(generation)) {
        return;
      }
      session.server = next;
      setStudy(next);
      setState(session.draft.queue.at(-1)?.state ?? next.state);
    },
    [live, session],
  );
  const report = useCallback(
    (cause: unknown, generation: number) => {
      if (!live(generation)) {
        return;
      }
      setError(errorMessage(cause));
      if (
        cause instanceof RequestError &&
        cause.code === 'STUDY_REVISION_CONFLICT'
      ) {
        setConflict(true);
      }
    },
    [live],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    const generation = session.generation;
    if (!live(generation) || !session.key) {
      return false;
    }
    if (session.flushing) {
      return session.flushing;
    }
    const run = async () => {
      try {
        await session.writes;
        while (live(generation) && session.draft.queue.length) {
          setStatus('Salvando…');
          const change = session.draft.queue[0]!;
          const saved = await api<PdfStudy>(`/materials/${materialId}/study`, {
            method: 'PUT',
            body: change,
          });
          if (
            !live(generation) ||
            session.draft.queue[0]?.operationId !== change.operationId
          ) {
            return false;
          }
          session.draft.queue.shift();
          accept(saved, generation);
          await persistStudySession(session);
        }
        if (!live(generation)) {
          return false;
        }
        setPending(false);
        setStatus('Salvo');
        setConflict(false);
        return true;
      } catch (cause) {
        if (live(generation)) {
          report(cause, generation);
          setStatus('Pendente');
          setPending(session.draft.queue.length > 0);
        }
        return false;
      }
    };
    const running = run();
    session.flushing = running;
    try {
      return await running;
    } finally {
      if (session.flushing === running) {
        session.flushing = null;
      }
    }
  }, [materialId, accept, report, live, session]);

  function begin(
    kind: StudyOperation['kind'],
    replace = false,
  ): StudyOperation | null {
    if (!live(session.generation) || (session.operation && !replace)) {
      return null;
    }
    const operation = {
      token: Symbol(kind),
      generation: session.generation,
      kind,
    };
    session.operation = operation;
    setBusy(true);
    setError('');
    return operation;
  }
  function owns(operation: StudyOperation): boolean {
    return (
      live(operation.generation) && sessionOwnsOperation(session, operation)
    );
  }
  function end(operation: StudyOperation) {
    if (owns(operation)) {
      session.operation = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    const generation = ++session.generation;
    session.active = true;
    const operation: StudyOperation = {
      token: Symbol('load'),
      generation,
      kind: 'load',
    };
    session.operation = operation;
    setStudy(null);
    setState(null);
    setStatus('Carregando…');
    setError('');
    setPending(false);
    setBusy(true);
    setProgress('');
    setConflict(false);
    setRetryQuestion(null);
    async function load() {
      try {
        const saved = await api<PdfStudy>(`/materials/${materialId}/study`, {
          method: 'POST',
        });
        if (!live(generation)) {
          return;
        }
        const key = `${saved.ownerId}:${materialId}`;
        const local = await readStudyDraft(key);
        if (!live(generation)) {
          return;
        }
        session.key = key;
        session.draft = local;
        if (
          local.tutor &&
          saved.turns.some(
            (turn) => turn.explanationId === local.tutor!.operationId,
          )
        ) {
          local.tutor = null;
          await persistStudySession(session);
        }
        if (!live(generation)) {
          return;
        }
        accept(saved, generation);
        setRetryQuestion(local.tutor);
        setPending(local.queue.length > 0);
        setStatus(local.queue.length ? 'Pendente' : 'Salvo');
        if (local.queue.length) {
          await flush();
        }
      } catch (cause) {
        if (live(generation)) {
          report(cause, generation);
          setStatus('Erro ao abrir');
        }
      } finally {
        if (sessionOwnsOperation(session, operation) && live(generation)) {
          session.operation = null;
          setBusy(false);
        }
      }
    }
    void load();
    const online = () => {
      if (!session.operation) {
        void flush();
      }
    };
    window.addEventListener('online', online);
    return () => {
      session.active = false;
      session.controller?.abort();
      window.removeEventListener('online', online);
    };
  }, [materialId, accept, report, live, flush, session]);

  const change = useCallback(
    (next: StudyEditorState) => {
      const generation = session.generation;
      if (
        !live(generation) ||
        !session.server ||
        session.operation ||
        session.draft.tutor
      ) {
        return;
      }
      if (session.draft.queue.length >= 50) {
        setError(
          'Há 50 alterações aguardando sincronização. Conecte-se e tente salvar antes de continuar.',
        );
        return;
      }
      const previous = session.draft.queue.at(-1);
      const baseRevision = previous
        ? previous.baseRevision + 1
        : session.server.revision;
      session.draft.queue.push({
        operationId: crypto.randomUUID(),
        baseRevision,
        state: structuredClone(next),
      });
      setState(next);
      setPending(true);
      setStatus('Salvando…');
      setError('');
      void persistStudySession(session)
        .then(() => (live(generation) ? flush() : false))
        .catch((cause: unknown) => {
          if (live(generation)) {
            report(cause, generation);
            setStatus('Erro no rascunho');
          }
        });
    },
    [live, session, report, flush],
  );

  async function history(direction: 'undo' | 'redo') {
    if (session.draft.tutor) {
      return;
    }
    const operation = begin('history');
    if (!operation) {
      return;
    }
    try {
      if (!(await flush()) || !owns(operation) || !session.server) {
        return;
      }
      const saved = await api<PdfStudy>(
        `/materials/${materialId}/study/history`,
        {
          method: 'POST',
          body: {
            operationId: crypto.randomUUID(),
            baseRevision: session.server.revision,
            direction,
          },
        },
      );
      if (owns(operation)) {
        accept(saved, operation.generation);
      }
    } catch (cause) {
      report(cause, operation.generation);
    } finally {
      end(operation);
    }
  }

  async function ask(
    question: Omit<StudyQuestion, 'operationId' | 'baseRevision'>,
  ) {
    const operation = begin('ask');
    if (!operation) {
      return;
    }
    const abort = new AbortController();
    session.controller = abort;
    setProgress('');
    const run = async () => {
      let completed = false;
      try {
        if (!(await flush()) || !owns(operation) || !session.server) {
          return;
        }
        const body = session.draft.tutor ?? {
          ...question,
          operationId: crypto.randomUUID(),
          baseRevision: session.server.revision,
        };
        session.draft.tutor = body;
        await persistStudySession(session);
        if (!owns(operation)) {
          return;
        }
        await apiStream<TutorEvent>(
          `/materials/${materialId}/study/tutor`,
          body,
          (event) => {
            if (!owns(operation)) {
              return;
            }
            if (event.type === 'delta') {
              setProgress((text) => text + event.text);
            }
            if (event.type === 'error') {
              throw new RequestError(0, event.code, event.message);
            }
            if (event.type === 'complete') {
              completed = true;
              session.draft.tutor = null;
              accept(event.study, operation.generation);
              setRetryQuestion(null);
              setProgress('');
              actions.current(event.annotationIds, event.pageIds, event.study);
            }
          },
          abort.signal,
        );
        if (!owns(operation)) {
          return;
        }
        if (!completed) {
          throw new Error(
            'A conexão terminou antes de confirmar a explicação. Tente novamente para recuperar o resultado.',
          );
        }
        await persistStudySession(session);
      } catch (cause) {
        if (owns(operation) && !abort.signal.aborted) {
          report(cause, operation.generation);
          setRetryQuestion(session.draft.tutor);
        }
      } finally {
        if (session.controller === abort) {
          session.controller = null;
        }
        end(operation);
      }
    };
    const running = run();
    session.asking = running;
    try {
      await running;
    } finally {
      if (session.asking === running) {
        session.asking = null;
      }
    }
  }

  async function cancel() {
    if (session.operation && session.operation.kind !== 'ask') {
      return;
    }
    const operation = begin('cancel', true);
    if (!operation) {
      return;
    }
    session.controller?.abort();
    const pendingTutor = session.draft.tutor;
    try {
      await session.asking;
      if (!owns(operation)) {
        return;
      }
      const saved = await api<PdfStudy>(`/materials/${materialId}/study`);
      if (!owns(operation)) {
        return;
      }
      session.draft.tutor = null;
      await persistStudySession(session);
      if (!owns(operation)) {
        return;
      }
      accept(saved, operation.generation);
      setRetryQuestion(null);
      setProgress('');
    } catch (cause) {
      if (owns(operation)) {
        session.draft.tutor = pendingTutor;
        report(cause, operation.generation);
        setRetryQuestion(pendingTutor);
      }
    } finally {
      end(operation);
    }
  }

  async function advance(lessonId: string, stepId: string) {
    if (session.draft.tutor) {
      return;
    }
    const operation = begin('advance');
    if (!operation) {
      return;
    }
    try {
      if (!(await flush()) || !owns(operation) || !session.server) {
        return;
      }
      const saved = await api<PdfStudy>(
        `/materials/${materialId}/study/lesson/advance`,
        {
          method: 'POST',
          body: {
            operationId: crypto.randomUUID(),
            baseRevision: session.server.revision,
            lessonId,
            stepId,
          },
        },
      );
      if (owns(operation)) {
        accept(saved, operation.generation);
        setStatus('Salvo');
      }
    } catch (cause) {
      report(cause, operation.generation);
    } finally {
      end(operation);
    }
  }

  async function reload() {
    const operation = begin('reload');
    if (!operation) {
      return;
    }
    const local = session.draft;
    try {
      await session.flushing;
      await session.writes;
      if (!owns(operation)) {
        return;
      }
      const saved = await api<PdfStudy>(`/materials/${materialId}/study`);
      if (!owns(operation)) {
        return;
      }
      session.draft = { queue: [], tutor: null };
      await persistStudySession(session);
      if (!owns(operation)) {
        return;
      }
      accept(saved, operation.generation);
      setPending(false);
      setConflict(false);
      setRetryQuestion(null);
      setStatus('Salvo');
      setProgress('');
      setError('');
    } catch (cause) {
      if (owns(operation)) {
        session.draft = local;
        report(cause, operation.generation);
      }
    } finally {
      end(operation);
    }
  }

  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(session.draft, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'caderno-rascunho.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    study,
    state,
    status,
    error,
    pending,
    busy,
    progress,
    conflict,
    retryQuestion,
    change,
    flush,
    history,
    ask,
    cancel,
    advance,
    reload,
    downloadDraft,
  };
}
