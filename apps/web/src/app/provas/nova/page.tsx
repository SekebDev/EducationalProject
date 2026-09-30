'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Conversation, Page } from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';

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
        'Informe de 1 até o número de questões em temas, separados por vírgula.',
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
      setError('Use de 10 a 30 questões e uma divisão válida entre os tipos.');
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
      <main className="main-content form-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Prática formativa</span>
            <h2>Monte sua prova</h2>
            <p>Parta de uma conversa e transforme suas dúvidas em prática.</p>
            {recommendation && (
              <p role="status">
                Nova prática a partir de uma recomendação. As questões serão
                diferentes das anteriores.
              </p>
            )}
          </div>
        </div>
        <form onSubmit={(event) => void submit(event)} className="exam-form">
          <div className="form-section">
            <span className="form-step">01 / CONVERSA</span>
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
                As últimas mensagens concluídas dessa conversa orientam a
                geração.
              </span>
            </div>
            {conversations.length === 0 && (
              <Link href="/conversas/nova">Começar uma conversa primeiro</Link>
            )}
          </div>
          <div className="form-section">
            <span className="form-step">02 / ASSUNTOS</span>
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
          </div>
          <div className="form-section">
            <span className="form-step">03 / QUESTÕES</span>
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
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" type="submit" disabled={pending}>
              {pending ? 'Criando prova…' : 'Gerar prova'}
            </button>
            <Link className="button ghost" href="/provas">
              Voltar
            </Link>
          </div>
        </form>
      </main>
    </StudyShell>
  );
}
