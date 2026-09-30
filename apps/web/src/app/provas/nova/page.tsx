'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Conversation, Page } from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { BlurFade } from '../../../components/ui/blur-fade';
import { Badge } from '../../../components/ui/badge';
import { NumberTicker } from '../../../components/ui/number-ticker';
import { ArrowUpRight, Check, Layers3 } from 'lucide-react';
import styles from '../../../features/attempts/practice.module.css';

type PracticeOrigin = {
  id: string;
  topics: Array<{ id: string; name: string }>;
  studyLevel: string;
  conversationId: string;
};

export default function NewExamPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [topics, setTopics] = useState('');
  const [studyLevel, setStudyLevel] = useState('Ensino Médio');
  const [total, setTotal] = useState(10);
  const [objectiveCount, setObjectiveCount] = useState(5);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [recommendation, setRecommendation] = useState<PracticeOrigin | null>(
    null,
  );
  const essayCount = total - objectiveCount;

  useEffect(() => {
    async function load() {
      try {
        const page = await api<Page<Conversation>>('/conversations');
        const params = new URLSearchParams(window.location.search);
        const recommendationId = params.get('recommendationId');
        const recommendationData = recommendationId
          ? await api<PracticeOrigin>(`/recommendations/${recommendationId}`)
          : null;
        if (recommendationData) {
          setRecommendation(recommendationData);
          setTopics(
            recommendationData.topics.map((topic) => topic.name).join(', '),
          );
          setStudyLevel(recommendationData.studyLevel);
        }
        const requested =
          recommendationData?.conversationId ?? params.get('conversationId');
        if (requested && !page.items.some((item) => item.id === requested)) {
          const origin = await api<Conversation>(`/conversations/${requested}`);
          setConversations([origin, ...page.items]);
          setConversationId(origin.id);
        } else {
          setConversations(page.items);
          setConversationId(requested ?? page.items[0]?.id ?? '');
        }
      } catch (cause) {
        setError(errorMessage(cause));
      }
    }
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topicNames = topics
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean);
    if (!conversationId) {
      setError('Escolha uma conversa com pelo menos uma pergunta.');
      return;
    }
    if (topicNames.length === 0 || topicNames.length > total) {
      setError(
        'Informe pelo menos 1 tema, sem ultrapassar o número de questões. Separe os temas por vírgula.',
      );
      return;
    }
    const topicIds = recommendation
      ? topicNames.map(
          (name) =>
            recommendation.topics.find(
              (topic) =>
                topic.name.toLocaleLowerCase('pt-BR') ===
                name.toLocaleLowerCase('pt-BR'),
            )?.id,
        )
      : [];
    if (recommendation && topicIds.some((id) => !id)) {
      setError('Escolha apenas temas da recomendação.');
      return;
    }
    if (
      !Number.isInteger(total) ||
      total < 10 ||
      total > 30 ||
      !Number.isInteger(objectiveCount) ||
      objectiveCount < 0 ||
      essayCount < 0
    ) {
      setError(
        'Escolha de 10 a 30 questões e distribua esse total entre objetivas e discursivas.',
      );
      return;
    }
    setError('');
    setPending(true);
    try {
      const created = await api<{ examId: string }>(
        recommendation
          ? `/recommendations/${recommendation.id}/practice`
          : '/exams',
        {
          method: 'POST',
          idempotent: true,
          body: recommendation
            ? {
                topicIds,
                studyLevel: studyLevel.trim(),
                total,
                objectiveCount,
                essayCount,
                materialIds: [],
              }
            : {
                conversationId,
                topicNames,
                studyLevel: studyLevel.trim(),
                total,
                objectiveCount,
                essayCount,
                materialIds: [],
              },
        },
      );
      router.push(`/provas/${created.examId}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <StudyShell title="Nova prova">
      <main className={`main-content form-page ${styles.stage}`}>
        <BlurFade className="page-heading" delay={0.04}>
          <div>
            <span className={styles.tagline}>Seu próximo desafio</span>
            <h2>Monte sua prova</h2>
            <p>
              Escolha o que estudar, ajuste a combinação de questões e crie uma
              prática feita para você.
            </p>
            {recommendation && (
              <p role="status">
                Nova prática a partir de uma recomendação. As questões serão
                diferentes das anteriores.
              </p>
            )}
          </div>
        </BlurFade>
        <div className={styles.builderLayout}>
          <form onSubmit={(event) => void submit(event)} className="exam-form">
            <BlurFade className="form-section" delay={0.1}>
              <span className="form-step">01 / CONVERSA</span>
              <div className={styles.stepHeader}>
                <h3>De onde vamos partir</h3>
              </div>
              <div className="field">
                <label htmlFor="exam-conversation">Conversa de origem</label>
                <select
                  id="exam-conversation"
                  value={conversationId}
                  onChange={(event) => setConversationId(event.target.value)}
                  disabled={Boolean(recommendation)}
                  required
                >
                  {conversations.length === 0 && (
                    <option value="">Nenhuma conversa disponível</option>
                  )}
                  {conversations.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  As últimas mensagens concluídas dessa conversa ajudam a
                  preparar as questões.
                </span>
              </div>
              {conversations.length === 0 && (
                <Link href="/conversas/nova">
                  Começar uma conversa primeiro
                </Link>
              )}
            </BlurFade>
            <BlurFade className="form-section" delay={0.16}>
              <span className="form-step">02 / ASSUNTOS</span>
              <div className={styles.stepHeader}>
                <h3>O que você quer praticar</h3>
              </div>
              <div className="field">
                <label htmlFor="exam-topics">Temas separados por vírgula</label>
                <input
                  id="exam-topics"
                  value={topics}
                  onChange={(event) => setTopics(event.target.value)}
                  maxLength={1000}
                  placeholder="Ex.: Ecologia, Genética"
                  required
                />
                <span className="hint">
                  Cada tema recebe pelo menos uma questão.
                </span>
              </div>
              <div className="field">
                <label htmlFor="exam-level">Nível de estudo</label>
                <input
                  id="exam-level"
                  value={studyLevel}
                  onChange={(event) => setStudyLevel(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>
            </BlurFade>
            <BlurFade className="form-section" delay={0.22}>
              <span className="form-step">03 / QUESTÕES</span>
              <div className={styles.stepHeader}>
                <h3>O ritmo da sua prova</h3>
              </div>
              <div className="exam-counts">
                <div className="field">
                  <label htmlFor="exam-total">Total</label>
                  <input
                    id="exam-total"
                    type="number"
                    min={10}
                    max={30}
                    step={1}
                    value={total}
                    onChange={(event) => setTotal(Number(event.target.value))}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="exam-objective">Objetivas</label>
                  <input
                    id="exam-objective"
                    type="number"
                    min={0}
                    max={total}
                    step={1}
                    value={objectiveCount}
                    onChange={(event) =>
                      setObjectiveCount(Number(event.target.value))
                    }
                    required
                  />
                </div>
                <div className="count-result" aria-live="polite">
                  <span>Discursivas</span>
                  <strong>{essayCount >= 0 ? essayCount : '—'}</strong>
                </div>
              </div>
            </BlurFade>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="submit" disabled={pending}>
                {pending ? 'Criando prova…' : 'Gerar prova'}{' '}
                <ArrowUpRight aria-hidden="true" />
              </Button>
              <Button asChild variant="ghost">
                <Link href="/provas">Voltar</Link>
              </Button>
            </div>
          </form>
          <BlurFade className={styles.builderAside} delay={0.18}>
            <div className={styles.asideIcon}>
              <Layers3 aria-hidden="true" />
            </div>
            <span className={styles.tagline}>Feita para você</span>
            <h3>Uma boa prática começa com uma boa escolha.</h3>
            <p>
              Seu material de estudo se transforma em questões para você pensar,
              responder e aprender.
            </p>
            <div className={styles.builderCount}>
              <NumberTicker
                value={Number.isFinite(total) ? Math.max(0, total) : 0}
              />
              <span>questões no seu ritmo</span>
            </div>
            <div className={styles.builderTags}>
              <Badge variant="outline">{objectiveCount} objetivas</Badge>
              <Badge variant="outline">
                {Math.max(0, essayCount)} discursivas
              </Badge>
            </div>
            <ul className={styles.builderChecklist}>
              <li>
                <Check aria-hidden="true" /> Temas escolhidos por você
              </li>
              <li>
                <Check aria-hidden="true" /> Correção com explicações
              </li>
              <li>
                <Check aria-hidden="true" /> Acompanhe sua evolução
              </li>
            </ul>
          </BlurFade>
        </div>
      </main>
    </StudyShell>
  );
}
