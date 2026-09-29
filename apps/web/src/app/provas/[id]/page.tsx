'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Exam } from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';

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
      <main className="main-content">
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
            <div className="page-heading">
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
            </div>
            {exam.state === 'queued' || exam.state === 'generating' ? (
              <div className="progress-panel" role="status" aria-live="polite">
                <span className="eyebrow">Em andamento</span>
                <h3>
                  {exam.state === 'queued'
                    ? 'Sua prova está na fila.'
                    : 'Estamos preparando as questões.'}
                </h3>
                <p>
                  Esta página será atualizada automaticamente. Você pode voltar
                  depois.
                </p>
              </div>
            ) : exam.state === 'failed' ? (
              <div className="progress-panel failed" role="alert">
                <span className="eyebrow">Não foi possível concluir</span>
                <h3>A geração falhou.</h3>
                <p>Você pode repetir a geração com a mesma configuração.</p>
                <button
                  className="button"
                  onClick={() => void retry()}
                  disabled={retrying}
                >
                  {retrying ? 'Reiniciando…' : 'Tentar novamente'}
                </button>{' '}
                <Link className="button secondary" href="/provas/nova">
                  Criar nova prova
                </Link>
              </div>
            ) : (
              <div className="question-list">
                {exam.attemptId && (
                  <Link
                    className="button"
                    href={`/tentativas/${exam.attemptId}`}
                  >
                    Responder prova
                  </Link>
                )}
                <p className="subtle">
                  Leia as questões e responda na sua tentativa.
                </p>
                {exam.questions.map((question) => (
                  <article className="question-preview" key={question.id}>
                    <span className="eyebrow">
                      Questão {question.ordinal} · {question.topic} ·{' '}
                      {question.type === 'objective'
                        ? 'Objetiva'
                        : 'Discursiva'}
                    </span>
                    <h3>{question.statement}</h3>
                    {question.alternatives && (
                      <ol type="A">
                        {question.alternatives.map((option) => (
                          <li key={option.id}>{option.text}</li>
                        ))}
                      </ol>
                    )}
                  </article>
                ))}
              </div>
            )}
            <button
              className="button danger small"
              disabled={deleting}
              onClick={() => void remove()}
            >
              Excluir prova
            </button>
          </>
        )}
      </main>
    </StudyShell>
  );
}
