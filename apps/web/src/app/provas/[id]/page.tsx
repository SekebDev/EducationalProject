'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Exam } from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { BlurFade } from '../../../components/ui/blur-fade';
import { Badge } from '../../../components/ui/badge';
import { LoaderCircle } from 'lucide-react';
import styles from '../../../features/attempts/practice.module.css';

export default function ExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        'Excluir esta prova e sua tentativa? O resultado deixará de aparecer na evolução.',
      )
    ) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await api<void>(`/exams/${params.id}`, { method: 'DELETE' });
      router.push('/provas');
    } catch (cause) {
      setError(errorMessage(cause));
      setDeleting(false);
    }
  }

  async function retry() {
    if (!exam) {
      return;
    }
    setRetrying(true);
    setError('');
    try {
      await api(`/operations/${exam.operationId}/retry`, {
        method: 'POST',
        idempotent: true,
      });
      setExam({ ...exam, state: 'queued' });
      const updated = await api<Exam>(`/exams/${params.id}`);
      setExam(updated);
      setRefreshToken((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await api<Exam>(`/exams/${params.id}`);
        if (!active) {
          return;
        }
        setExam(result);
        setError('');
        setLoading(false);
        if (result.state === 'queued' || result.state === 'generating') {
          timer = setTimeout(() => void refresh(), 2000);
        }
      } catch (cause) {
        if (!active) {
          return;
        }
        setError(errorMessage(cause));
        setLoading(false);
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [params.id, refreshToken]);

  return (
    <StudyShell title="Prova">
      <main className={`main-content ${styles.stage}`}>
        <Link className="back-link" href="/provas">
          ← Todas as provas
        </Link>
        {loading ? <p aria-busy="true">Carregando prova…</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {exam && (
          <>
            <BlurFade className="page-heading" delay={0.04}>
              <div>
                <span className="eyebrow">{exam.studyLevel}</span>
                <h2>{exam.title}</h2>
                <p>
                  {exam.total} questões · {exam.objectiveCount} objetivas ·{' '}
                  {exam.essayCount} discursivas
                </p>
                {exam.conversationTitle && (
                  <p>Gerada a partir da conversa “{exam.conversationTitle}”.</p>
                )}
              </div>
            </BlurFade>
            {exam.state === 'queued' || exam.state === 'generating' ? (
              <div role="status" aria-live="polite">
                <BlurFade className="progress-panel">
                  <LoaderCircle
                    className={styles.preparingIcon}
                    aria-hidden="true"
                  />
                  <span className="eyebrow">Em andamento</span>
                  <h3>
                    {exam.state === 'queued'
                      ? 'Sua prova está na fila.'
                      : 'Estamos preparando as questões.'}
                  </h3>
                  <p>
                    Esta página será atualizada automaticamente. Você pode
                    voltar depois.
                  </p>
                </BlurFade>
              </div>
            ) : exam.state === 'failed' ? (
              <div role="alert">
                <BlurFade className="progress-panel failed">
                  <span className="eyebrow">Não foi possível concluir</span>
                  <h3>Não conseguimos preparar sua prova.</h3>
                  <p>Você pode tentar novamente com as mesmas escolhas.</p>
                  <Button onClick={() => void retry()} disabled={retrying}>
                    {retrying ? 'Reiniciando…' : 'Tentar novamente'}
                  </Button>{' '}
                  <Button asChild variant="outline">
                    <Link href="/provas/nova">Criar nova prova</Link>
                  </Button>
                </BlurFade>
              </div>
            ) : (
              <div className="question-list">
                {exam.attemptId && (
                  <Button asChild>
                    <Link href={`/tentativas/${exam.attemptId}`}>
                      Responder prova <span aria-hidden="true">↗</span>
                    </Link>
                  </Button>
                )}
                <p className="subtle">
                  Leia as questões abaixo e responda na página da tentativa.
                </p>
                {exam.questions.map((question, index) => (
                  <BlurFade
                    className="question-preview"
                    delay={Math.min(index * 0.04, 0.28)}
                    key={question.id}
                  >
                    <div className={styles.questionMeta}>
                      <span className={styles.questionOrdinal}>
                        Questão {String(question.ordinal).padStart(2, '0')}
                      </span>
                      <Badge variant="secondary">{question.topic}</Badge>
                      <Badge variant="outline">
                        {question.type === 'objective'
                          ? 'Objetiva'
                          : 'Discursiva'}
                      </Badge>
                    </div>
                    <h3>{question.statement}</h3>
                    {question.alternatives && (
                      <ol type="A">
                        {question.alternatives.map((option) => (
                          <li key={option.id}>{option.text}</li>
                        ))}
                      </ol>
                    )}
                  </BlurFade>
                ))}
              </div>
            )}
            <div className={styles.dangerZone}>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={() => void remove()}
              >
                Excluir prova
              </Button>
            </div>
          </>
        )}
      </main>
    </StudyShell>
  );
}
