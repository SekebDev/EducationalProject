'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, RequestError } from '../../lib/api';

type Feedback = {
  points: number | null;
  correctOptionId: string | null;
  optionExplanations: Array<{ optionId: string; explanation: string }> | null;
  criteria: Array<{
    label: string;
    awardedUnits: number;
    maxUnits: number;
    reason: string;
  }> | null;
  explanation: string | null;
  gaps: string[] | null;
  referenceAnswer: string | null;
};
type Question = {
  id: string;
  ordinal: number;
  type: 'objective' | 'essay';
  topic: string;
  statement: string;
  alternatives?: Array<{ id: string; text: string }>;
  answer: null | {
    draftValue: string | null;
    draftVersion: number;
    confirmedValue: string | null;
    state: 'draft' | 'confirmed_pending' | 'graded' | 'blank';
    gradeState: 'pending' | 'graded' | 'failed' | 'contested' | null;
    feedback: Feedback | null;
  };
};
type Attempt = {
  id: string;
  examId: string;
  state: 'in_progress' | 'submitted_pending' | 'completed';
  version: number;
  questions: Question[];
};

function QuestionInput({
  question,
  value,
  disabled,
  onChange,
}: {
  question: Question;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (question.type === 'essay') {
    return (
      <label className="field">
        <span>Sua resposta</span>
        <textarea
          value={value}
          maxLength={20_000}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }
  return (
    <fieldset className="answer-options" disabled={disabled}>
      <legend className="sr-only">
        Resposta da questão {question.ordinal}
      </legend>
      {question.alternatives?.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={`answer-${question.id}`}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span>
            {option.id}. {option.text}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  return (
    <div className="answer-feedback">
      <strong>
        Nota:{' '}
        {feedback.points === null
          ? 'Pendente'
          : `${feedback.points.toLocaleString('pt-BR')} / 1`}
      </strong>
      {feedback.correctOptionId && (
        <p>Alternativa correta: {feedback.correctOptionId}</p>
      )}
      {feedback.optionExplanations?.map((item) => (
        <p key={item.optionId}>
          {item.optionId}: {item.explanation}
        </p>
      ))}
      {feedback.criteria?.map((item) => (
        <p key={item.label}>
          {item.label}: {item.awardedUnits / 10_000} / {item.maxUnits / 10_000}{' '}
          · {item.reason}
        </p>
      ))}
      {feedback.explanation && <p>{feedback.explanation}</p>}
    </div>
  );
}

export function AttemptClient({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState(false);
  const [confirmBlanks, setConfirmBlanks] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef<Record<string, string>>({});
  const saved = useRef<Record<string, string>>({});
  const versions = useRef<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queues = useRef<Record<string, Promise<void>>>({});

  const refresh = useCallback(async () => {
    const next = await api<Attempt>(`/attempts/${id}`);
    setAttempt(next);
    setValues((current) => {
      const merged = { ...current };
      for (const question of next.questions) {
        if (merged[question.id] === undefined) {
          const value =
            question.answer?.confirmedValue ??
            question.answer?.draftValue ??
            '';
          merged[question.id] = value;
          latest.current[question.id] = value;
          saved.current[question.id] = question.answer?.draftValue ?? value;
          versions.current[question.id] = question.answer?.draftVersion ?? 0;
        }
      }
      return merged;
    });
    return next;
  }, [id]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(errorMessage(cause)));
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, [refresh]);

  useEffect(() => {
    if (!attempt || !['submitted_pending'].includes(attempt.state)) {
      return;
    }
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      2_000,
    );
    return () => clearInterval(timer);
  }, [attempt, refresh]);

  function save(questionId: string): Promise<void> {
    const previous = queues.current[questionId] ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const value = latest.current[questionId] ?? '';
        if (value === saved.current[questionId]) {
          return;
        }
        setSaving((current) => ({ ...current, [questionId]: true }));
        try {
          const result = await api<{ draftVersion: number }>(
            `/attempts/${id}/answers/${questionId}/draft`,
            {
              method: 'PUT',
              body: {
                value,
                expectedVersion: versions.current[questionId] ?? 0,
              },
            },
          );
          versions.current[questionId] = result.draftVersion;
          saved.current[questionId] = value;
          if (latest.current[questionId] === value) {
            setDirty((current) => ({ ...current, [questionId]: false }));
          }
        } catch (cause) {
          setError(errorMessage(cause));
          if (
            cause instanceof RequestError &&
            cause.code === 'VERSION_CONFLICT'
          ) {
            await refresh();
          }
          throw cause;
        } finally {
          setSaving((current) => ({ ...current, [questionId]: false }));
        }
      });
    queues.current[questionId] = next;
    return next;
  }

  function change(questionId: string, value: string) {
    latest.current[questionId] = value;
    setDirty((current) => ({ ...current, [questionId]: true }));
    setValues((current) => ({ ...current, [questionId]: value }));
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(
      () => void save(questionId).catch(() => undefined),
      700,
    );
  }

  async function flush(questionId: string) {
    clearTimeout(timers.current[questionId]);
    await save(questionId);
  }

  async function confirm(question: Question) {
    setWorking(true);
    setError('');
    try {
      await flush(question.id);
      await api(`/attempts/${id}/answers/${question.id}/confirm`, {
        method: 'POST',
        idempotent: true,
        body: {
          value: latest.current[question.id] ?? '',
          expectedVersion: versions.current[question.id] ?? 0,
        },
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  async function submit(acceptUnanswered: boolean) {
    if (!attempt) {
      return;
    }
    setWorking(true);
    setError('');
    try {
      for (const question of attempt.questions) {
        if (!question.answer || question.answer.state === 'draft') {
          await flush(question.id);
        }
      }
      const current = await refresh();
      await api(`/attempts/${id}/submit`, {
        method: 'POST',
        body: { expectedVersion: current.version, acceptUnanswered },
      });
      setConfirmBlanks(false);
      await refresh();
    } catch (cause) {
      if (
        cause instanceof RequestError &&
        cause.code === 'UNANSWERED_CONFIRMATION_REQUIRED'
      ) {
        setConfirmBlanks(true);
      }
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  if (!attempt) {
    return <p aria-busy="true">Carregando tentativa… {error}</p>;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Prática formativa</span>
          <h2>Responder prova</h2>
          <p>
            {attempt.questions.length} questões ·{' '}
            {attempt.state === 'in_progress' ? 'Em andamento' : 'Entregue'}
          </p>
        </div>
        <Link href={`/provas/${attempt.examId}`}>Ver prova</Link>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {attempt.state !== 'in_progress' && (
        <div className="progress-panel">
          <h3>
            {attempt.state === 'completed'
              ? 'Correção concluída'
              : 'Correção em andamento'}
          </h3>
          <Link className="button" href={`/tentativas/${id}/resultado`}>
            Ver resultado
          </Link>
        </div>
      )}
      <div className="question-list">
        {attempt.questions.map((question) => {
          const locked =
            attempt.state !== 'in_progress' ||
            Boolean(question.answer && question.answer.state !== 'draft');
          const feedback = question.answer?.feedback;
          return (
            <article className="question-preview" key={question.id}>
              <span className="eyebrow">
                Questão {question.ordinal} · {question.topic} ·{' '}
                {question.type === 'objective' ? 'Objetiva' : 'Discursiva'}
              </span>
              <h3>{question.statement}</h3>
              <QuestionInput
                question={question}
                value={values[question.id] ?? ''}
                disabled={locked || working}
                onChange={(value) => change(question.id, value)}
              />
              {attempt.state === 'in_progress' && !locked && (
                <div className="answer-actions">
                  <span className="hint">
                    {saving[question.id]
                      ? 'Salvando rascunho…'
                      : dirty[question.id]
                        ? 'Alteração ainda não salva'
                        : 'Rascunho salvo automaticamente'}
                  </span>
                  <button
                    className="button secondary small"
                    disabled={working || !(values[question.id] ?? '').trim()}
                    onClick={() => void confirm(question)}
                  >
                    Confirmar resposta
                  </button>
                </div>
              )}
              {question.answer?.state === 'confirmed_pending' && (
                <p className="hint">
                  Resposta confirmada. A correção está pendente.
                </p>
              )}
              {question.answer?.gradeState === 'failed' && (
                <p className="form-error">
                  A correção falhou. Seu texto permanece salvo.
                </p>
              )}
              {feedback && <FeedbackPanel feedback={feedback} />}
            </article>
          );
        })}
      </div>
      {attempt.state === 'in_progress' && (
        <div className="submit-panel">
          <h3>Entregar tentativa</h3>
          <p>Rascunhos não confirmados contam como questões em branco.</p>
          <button
            className="button"
            disabled={working}
            onClick={() => void submit(false)}
          >
            Entregar tentativa
          </button>
          {confirmBlanks && (
            <button
              className="button danger"
              disabled={working}
              onClick={() => void submit(true)}
            >
              Confirmar entrega com respostas em branco
            </button>
          )}
        </div>
      )}
    </>
  );
}
