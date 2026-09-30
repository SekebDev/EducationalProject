'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ExamListItem, Page } from '@study/contracts';
import { StudyShell } from '../../features/study/StudyShell';
import { api, errorMessage } from '../../lib/api';

const stateLabel: Record<ExamListItem['state'], string> = {
  queued: 'Na fila',
  generating: 'Gerando',
  ready: 'Pronta',
  failed: 'Falha na geração',
};

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Page<ExamListItem>>('/exams')
      .then((page) => setExams(page.items))
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudyShell title="Provas">
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Pratique o que aprendeu</span>
            <h2>Suas provas</h2>
            <p>Transforme suas conversas em questões para praticar.</p>
          </div>
          <Link className="button" href="/provas/nova">
            Criar prova
          </Link>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p aria-busy="true">Carregando provas…</p>
        ) : exams.length === 0 ? (
          <div className="empty-grid">
            <div className="empty">
              <span className="eyebrow">Uma pergunta de cada vez</span>
              <h3>Sua primeira prova começa aqui.</h3>
              <p>
                Escolha uma conversa e monte de 10 a 30 questões sobre o que
                estudou.
              </p>
              <Link className="button secondary" href="/provas/nova">
                Configurar prova
              </Link>
            </div>
            <aside className="prompt-note">
              <span className="eyebrow">Como funciona</span>
              <p>Parta de uma conversa com suas dúvidas.</p>
              <p>Combine questões objetivas e discursivas.</p>
              <p>Acompanhe a geração nesta página.</p>
            </aside>
          </div>
        ) : (
          <div className="list">
            {exams.map((exam) => (
              <article className="list-item" key={exam.id}>
                <div>
                  <Link href={`/provas/${exam.id}`}>{exam.title}</Link>
                  <p>
                    {exam.conversationTitle
                      ? `${exam.conversationTitle} · `
                      : ''}
                    {exam.total} questões · {exam.studyLevel} ·{' '}
                    {new Date(exam.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span className={`state-badge state-${exam.state}`}>
                  {stateLabel[exam.state]}
                </span>
              </article>
            ))}
          </div>
        )}
      </main>
    </StudyShell>
  );
}
