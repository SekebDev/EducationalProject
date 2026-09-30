'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ExamListItem, Page } from '@study/contracts';
import { StudyShell } from '../../features/study/StudyShell';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { BlurFade } from '../../components/ui/blur-fade';
import { NumberTicker } from '../../components/ui/number-ticker';
import { ArrowUpRight, BookOpen, CheckCheck, Clock3 } from 'lucide-react';
import styles from '../../features/attempts/practice.module.css';

const stateLabel: Record<ExamListItem['state'], string> = {
  queued: 'Na fila',
  generating: 'Preparando',
  ready: 'Pronta',
  failed: 'Erro na preparação',
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
      <main className={`main-content ${styles.stage}`}>
        <BlurFade className="page-heading" delay={0.04}>
          <div>
            <span className={styles.tagline}>Biblioteca de prática</span>
            <h2>Suas provas</h2>
            <p>
              Teste o que aprendeu com questões criadas a partir das suas
              conversas e acompanhe sua evolução.
            </p>
          </div>
          <Button asChild>
            <Link href="/provas/nova">
              Criar prova <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </BlurFade>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p aria-busy="true">Carregando provas…</p>
        ) : exams.length === 0 ? (
          <BlurFade className="empty-grid" delay={0.12}>
            <div className="empty">
              <span className={styles.emptyMark} aria-hidden="true">
                ✦
              </span>
              <span className="eyebrow">Uma pergunta de cada vez</span>
              <h3>Sua primeira prova começa aqui.</h3>
              <p>
                Escolha uma conversa e monte de 10 a 30 questões sobre o que
                estudou.
              </p>
              <Button asChild variant="outline">
                <Link href="/provas/nova">Configurar prova</Link>
              </Button>
            </div>
            <aside className="prompt-note">
              <span className="eyebrow">Como funciona</span>
              <p>Parta de uma conversa com suas dúvidas.</p>
              <p>Combine questões objetivas e discursivas.</p>
              <p>Acompanhe a preparação da prova nesta página.</p>
            </aside>
          </BlurFade>
        ) : (
          <>
            <BlurFade className={styles.libraryMetrics} delay={0.1}>
              <div>
                <BookOpen aria-hidden="true" />
                <span>Na biblioteca</span>
                <strong>
                  <NumberTicker value={exams.length} />
                </strong>
              </div>
              <div>
                <CheckCheck aria-hidden="true" />
                <span>Prontas para praticar</span>
                <strong>
                  <NumberTicker
                    value={
                      exams.filter((exam) => exam.state === 'ready').length
                    }
                  />
                </strong>
              </div>
              <div>
                <Clock3 aria-hidden="true" />
                <span>Em preparação</span>
                <strong>
                  <NumberTicker
                    value={
                      exams.filter((exam) =>
                        ['queued', 'generating'].includes(exam.state),
                      ).length
                    }
                  />
                </strong>
              </div>
            </BlurFade>
            <div className={styles.sectionHeading}>
              <div>
                <h3>Na sua biblioteca</h3>
                <p>
                  {exams.length}{' '}
                  {exams.length === 1 ? 'prova criada' : 'provas criadas'}
                </p>
              </div>
            </div>
            <div className="list">
              {exams.map((exam, index) => (
                <BlurFade
                  className="list-item"
                  delay={Math.min(index * 0.05, 0.3)}
                  key={exam.id}
                >
                  <span className={styles.examIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className={styles.examDescription}>
                    <Link href={`/provas/${exam.id}`}>{exam.title}</Link>
                    <p>
                      {exam.conversationTitle
                        ? `${exam.conversationTitle} · `
                        : ''}
                      {exam.total} questões · {exam.studyLevel} ·{' '}
                      {new Date(exam.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className={styles.examStatus}>
                    <Badge
                      variant={
                        exam.state === 'failed' ? 'destructive' : 'secondary'
                      }
                    >
                      {stateLabel[exam.state]}
                    </Badge>
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        href={`/provas/${exam.id}`}
                        aria-label={`Abrir prova ${exam.title}`}
                      >
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </BlurFade>
              ))}
            </div>
          </>
        )}
      </main>
    </StudyShell>
  );
}
