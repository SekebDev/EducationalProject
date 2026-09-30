'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StudyShell } from '../../../../features/study/StudyShell';
import { api, errorMessage } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { BlurFade } from '../../../../components/ui/blur-fade';
import { NumberTicker } from '../../../../components/ui/number-ticker';
import { Badge } from '../../../../components/ui/badge';
import styles from '../../../../features/attempts/practice.module.css';

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
  const [openRevisions, setOpenRevisions] = useState<Record<string, boolean>>(
    {},
  );
  const [revisionLoading, setRevisionLoading] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setResult(await api<Result>(`/attempts/${id}/result`));
  }, [id]);

  useEffect(() => {
    void refresh()
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function retryLoad() {
    setLoading(true);
    setError('');
    try {
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

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
    if (revisions[answerId]) {
      setOpenRevisions((current) => ({
        ...current,
        [answerId]: !current[answerId],
      }));
      return;
    }
    setRevisionLoading((current) => ({ ...current, [answerId]: true }));
    try {
      const data = await api<{ items: Revision[] }>(
        `/answers/${answerId}/grade-revisions`,
      );
      setRevisions((current) => ({ ...current, [answerId]: data.items }));
      setOpenRevisions((current) => ({ ...current, [answerId]: true }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRevisionLoading((current) => ({ ...current, [answerId]: false }));
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
      <main className={`main-content ${styles.stage}`}>
        <Link className="back-link" href={`/tentativas/${id}`}>
          ← Voltar à tentativa
        </Link>
        <BlurFade className="page-heading" delay={0.04}>
          <div>
            <span className={styles.tagline}>Um passo adiante</span>
            <h2>Resultado da tentativa</h2>
            <p>
              Entenda seus acertos, acompanhe as revisões e escolha o que
              estudar mais a fundo.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/evolucao">Ver evolução ↗</Link>
          </Button>
        </BlurFade>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!result ? (
          loading ? (
            <p role="status" aria-busy="true">
              Carregando resultado…
            </p>
          ) : (
            <div className="progress-panel">
              <p>Não foi possível carregar o resultado.</p>
              <Button variant="outline" onClick={() => void retryLoad()}>
                Tentar novamente
              </Button>
            </div>
          )
        ) : (
          <>
            <div role="status">
              <BlurFade className="result-score" delay={0.1}>
                <span className={styles.tagline}>Seu aproveitamento</span>
                <strong>
                  {result.points === null ? (
                    'Correção pendente'
                  ) : (
                    <>
                      <NumberTicker value={result.points} decimalPlaces={2} />{' '}
                      <span className={styles.microcopy}>
                        / {result.maxPoints} pontos
                      </span>
                    </>
                  )}
                </strong>
                {result.points === null && (
                  <p>
                    Nota provisória das questões corrigidas:{' '}
                    {result.provisionalPoints.toLocaleString('pt-BR')}. As
                    respostas que aguardam correção não receberam zero.
                  </p>
                )}
              </BlurFade>
            </div>
            <BlurFade delay={0.16}>
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
                    <dd>
                      <NumberTicker value={count} />
                    </dd>
                  </div>
                ))}
              </dl>
            </BlurFade>
            <div className={styles.sectionHeading}>
              <div>
                <h3>Questão por questão</h3>
                <p>Veja a correção e retome os pontos que pedem atenção.</p>
              </div>
            </div>
            <div className="question-list">
              {result.answers.map((answer, index) => (
                <div id={`resposta-${answer.answerId}`} key={answer.answerId}>
                  <BlurFade
                    className="question-preview"
                    delay={Math.min(index * 0.04, 0.28)}
                  >
                    <div className={styles.resultAnswerTop}>
                      <span>
                        Questão {answer.ordinal} · {answer.topic}
                      </span>
                      <Badge
                        variant={
                          answer.state === 'contested' ? 'outline' : 'secondary'
                        }
                      >
                        {answer.state === 'graded'
                          ? 'Corrigida'
                          : answer.state === 'contested'
                            ? 'Contestada'
                            : 'Pendente'}
                      </Badge>
                    </div>
                    <h3>
                      {answer.points === null
                        ? 'Correção pendente ou contestada'
                        : `${answer.points.toLocaleString('pt-BR')} / 1 ponto`}
                    </h3>
                    <Button
                      variant="outline"
                      aria-expanded={Boolean(openRevisions[answer.answerId])}
                      aria-controls={`revisions-${answer.answerId}`}
                      disabled={Boolean(revisionLoading[answer.answerId])}
                      onClick={() => void showRevisions(answer.answerId)}
                    >
                      {revisionLoading[answer.answerId]
                        ? 'Carregando revisões…'
                        : openRevisions[answer.answerId]
                          ? 'Ocultar revisões'
                          : 'Ver revisões'}
                    </Button>
                    <div
                      id={`revisions-${answer.answerId}`}
                      hidden={!openRevisions[answer.answerId]}
                    >
                      {revisions[answer.answerId]?.length ? (
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
                                  {criterion.maxUnits / 10_000} ·{' '}
                                  {criterion.reason}
                                </p>
                              ))}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>Nenhuma revisão disponível.</p>
                      )}
                    </div>
                    {answer.disputeStatus === 'reviewing' && (
                      <p className="hint">Reavaliação em andamento.</p>
                    )}
                    {answer.disputeStatus === 'open' && answer.disputeId && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void reevaluate(answer.disputeId!)}
                      >
                        Solicitar reavaliação
                      </Button>
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
                          <Button
                            variant="outline"
                            disabled={
                              busy || !(reasons[answer.answerId] ?? '').trim()
                            }
                            onClick={() => void dispute(answer.answerId)}
                          >
                            Enviar contestação
                          </Button>
                        </div>
                      )}
                  </BlurFade>
                </div>
              ))}
            </div>
            <div className={styles.dangerZone}>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void remove()}
              >
                Excluir tentativa
              </Button>
            </div>
          </>
        )}
      </main>
    </StudyShell>
  );
}
