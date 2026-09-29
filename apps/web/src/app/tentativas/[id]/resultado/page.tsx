'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StudyShell } from '../../../../features/study/StudyShell';
import { api, errorMessage } from '../../../../lib/api';

type Result = {
  attemptId: string;
  state: 'submitted_pending' | 'completed';
  points: number | null;
  provisionalPoints: number;
  maxPoints: number;
  counts: {
    full: number;
    partial: number;
    wrong: number;
    blank: number;
    pending: number;
    contested: number;
  };
  answers: Array<{
    answerId: string;
    ordinal: number;
    topic: string;
    state: string;
    points: number | null;
    disputeId: string | null;
    disputeStatus: string | null;
  }>;
};
type Revision = {
  id: string;
  revision_number: number;
  points_units: number;
  explanation: string;
  criterion_scores: Array<{
    label: string;
    awardedUnits: number;
    maxUnits: number;
    reason: string;
  }> | null;
  created_at: string;
};

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [revisions, setRevisions] = useState<Record<string, Revision[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setResult(await api<Result>(`/attempts/${id}/result`));
  }, [id]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(errorMessage(cause)));
  }, [refresh]);

  useEffect(() => {
    if (
      !result ||
      (result.state !== 'submitted_pending' &&
        !result.answers.some((answer) => answer.disputeStatus === 'reviewing'))
    ) {
      return;
    }
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      2_000,
    );
    return () => clearInterval(timer);
  }, [result, refresh]);

  async function dispute(answerId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/answers/${answerId}/disputes`, {
        method: 'POST',
        body: { reason: reasons[answerId] ?? '' },
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function reevaluate(disputeId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/disputes/${disputeId}/reevaluate`, {
        method: 'POST',
        idempotent: true,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function showRevisions(answerId: string) {
    try {
      const data = await api<{ items: Revision[] }>(
        `/answers/${answerId}/grade-revisions`,
      );
      setRevisions((current) => ({ ...current, [answerId]: data.items }));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function remove() {
    if (
      !window.confirm('Excluir esta tentativa e retirá-la dos indicadores?')
    ) {
      return;
    }
    setBusy(true);
    try {
      await api<void>(`/attempts/${id}`, { method: 'DELETE' });
      router.push('/provas');
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <StudyShell title="Resultado">
      <main className="main-content">
        <Link className="back-link" href={`/tentativas/${id}`}>
          ← Voltar à tentativa
        </Link>
        <div className="page-heading">
          <div>
            <span className="eyebrow">Prática formativa</span>
            <h2>Resultado da tentativa</h2>
          </div>
          <Link className="button secondary small" href="/evolucao">
            Ver evolução
          </Link>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!result ? (
          <p aria-busy="true">Carregando resultado…</p>
        ) : (
          <>
            <div className="result-score" role="status">
              <strong>
                {result.points === null
                  ? 'Correção pendente'
                  : `${result.points.toLocaleString('pt-BR')} / ${result.maxPoints}`}
              </strong>
              {result.points === null && (
                <p>
                  Nota provisória das questões corrigidas:{' '}
                  {result.provisionalPoints.toLocaleString('pt-BR')}. Respostas
                  pendentes não receberam zero.
                </p>
              )}
            </div>
            <dl className="result-counts">
              {Object.entries({
                Acertos: result.counts.full,
                Parciais: result.counts.partial,
                Erros: result.counts.wrong,
                'Em branco': result.counts.blank,
                Pendentes: result.counts.pending,
                Contestadas: result.counts.contested,
              }).map(([label, count]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
            <div className="question-list">
              {result.answers.map((answer) => (
                <article className="question-preview" key={answer.answerId}>
                  <span className="eyebrow">
                    Questão {answer.ordinal} · {answer.topic}
                  </span>
                  <h3>
                    {answer.points === null
                      ? 'Correção pendente ou contestada'
                      : `${answer.points.toLocaleString('pt-BR')} / 1 ponto`}
                  </h3>
                  <p>
                    Estado:{' '}
                    {answer.state === 'graded'
                      ? 'Corrigida'
                      : answer.state === 'contested'
                        ? 'Contestada'
                        : 'Pendente'}
                  </p>
                  <button
                    className="button secondary small"
                    onClick={() => void showRevisions(answer.answerId)}
                  >
                    Ver revisões
                  </button>
                  {revisions[answer.answerId] && (
                    <ol className="revision-list">
                      {revisions[answer.answerId]?.map((revision) => (
                        <li key={revision.id}>
                          <strong>
                            Revisão {revision.revision_number} ·{' '}
                            {revision.points_units / 10_000} / 1 ponto
                          </strong>
                          <p>{revision.explanation}</p>
                          {revision.criterion_scores?.map((criterion) => (
                            <p key={criterion.label}>
                              {criterion.label}:{' '}
                              {criterion.awardedUnits / 10_000} /{' '}
                              {criterion.maxUnits / 10_000} · {criterion.reason}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ol>
                  )}
                  {answer.disputeStatus === 'reviewing' && (
                    <p className="hint">Reavaliação em andamento.</p>
                  )}
                  {answer.disputeStatus === 'open' && answer.disputeId && (
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => void reevaluate(answer.disputeId!)}
                    >
                      Solicitar reavaliação
                    </button>
                  )}
                  {answer.state === 'graded' &&
                    answer.disputeStatus !== 'open' && (
                      <div className="dispute-form">
                        <label htmlFor={`reason-${answer.answerId}`}>
                          Contestar correção
                        </label>
                        <textarea
                          id={`reason-${answer.answerId}`}
                          maxLength={2_000}
                          value={reasons[answer.answerId] ?? ''}
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [answer.answerId]: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="button secondary small"
                          disabled={
                            busy || !(reasons[answer.answerId] ?? '').trim()
                          }
                          onClick={() => void dispute(answer.answerId)}
                        >
                          Enviar contestação
                        </button>
                      </div>
                    )}
                </article>
              ))}
            </div>
            <button
              className="button danger small"
              disabled={busy}
              onClick={() => void remove()}
            >
              Excluir tentativa
            </button>
          </>
        )}
      </main>
    </StudyShell>
  );
}
