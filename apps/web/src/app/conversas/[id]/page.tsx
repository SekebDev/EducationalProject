'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  Conversation,
  Message,
  Page,
  Personality,
} from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { MaterialsPanel } from '../../../features/materials/MaterialsPanel';
import { api, errorMessage, RequestError } from '../../../lib/api';

const personalityNames: Record<Personality, string> = {
  acolhedora: 'Acolhedora',
  objetiva: 'Objetiva',
  socratica: 'Socrática',
};

type Locator = { kind: 'page' | 'paragraph' | 'line'; number: number };

function locatorLabel(locator: Locator): string {
  const label =
    locator.kind === 'page'
      ? 'página'
      : locator.kind === 'paragraph'
        ? 'parágrafo'
        : 'linha';
  return `${label} ${locator.number}`;
}

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [sourcePreview, setSourcePreview] = useState<{
    name: string;
    text: string;
    locator: Locator;
  } | null>(null);
  const active = messages.some(
    (message) =>
      message.role === 'assistant' &&
      ['queued', 'generating'].includes(message.state),
  );

  const refresh = useCallback(async () => {
    const [nextConversation, page] = await Promise.all([
      api<Conversation>(`/conversations/${id}`),
      api<Page<Message>>(`/conversations/${id}/messages`),
    ]);
    setConversation(nextConversation);
    setMessages(page.items);
  }, [id]);

  useEffect(() => {
    let mounted = true;
    refresh()
      .catch((cause: unknown) => {
        if (mounted) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      void refresh().catch((cause: unknown) => setError(errorMessage(cause)));
    }, 1500);
    return () => clearInterval(timer);
  }, [active, refresh]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || !content.trim()) {
      return;
    }
    setSending(true);
    setError('');
    try {
      await api(`/conversations/${id}/messages`, {
        method: 'POST',
        idempotent: true,
        body: {
          content: content.trim(),
          conversationVersion: conversation.version,
        },
      });
      setContent('');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof RequestError && cause.code === 'VERSION_CONFLICT') {
        await refresh().catch(() => undefined);
      }
    } finally {
      setSending(false);
    }
  }

  async function changePersonality(personality: Personality) {
    if (!conversation) {
      return;
    }
    setUpdating(true);
    setError('');
    try {
      const updated = await api<Conversation>(`/conversations/${id}`, {
        method: 'PATCH',
        body: { personality, version: conversation.version },
      });
      setConversation(updated);
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    } finally {
      setUpdating(false);
    }
  }

  async function retry(operationId: string) {
    setError('');
    try {
      await api(`/operations/${operationId}/retry`, {
        method: 'POST',
        idempotent: true,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function remove() {
    if (!conversation) {
      return;
    }
    if (
      !window.confirm(
        'Excluir esta conversa? As mensagens e os materiais deixam de ficar disponíveis. As provas já criadas são preservadas.',
      )
    ) {
      return;
    }
    setError('');
    try {
      await api<void>(`/conversations/${id}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('conversations-changed'));
      router.push('/conversas');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function showSource(materialId: string, chunkId: string, name: string) {
    setError('');
    try {
      const chunk = await api<{ text: string; locator: Locator }>(
        `/materials/${materialId}/chunks/${chunkId}`,
      );
      setSourcePreview({ name, ...chunk });
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    }
  }

  return (
    <StudyShell title={conversation?.title ?? 'Conversa'}>
      {loading ? (
        <main className="main-content" aria-busy="true">
          <p>Carregando conversa…</p>
        </main>
      ) : !conversation ? (
        <main className="main-content">
          <p className="form-error" role="alert">
            {error || 'Conversa indisponível.'}
          </p>
          <Link href="/conversas">Voltar às conversas</Link>
        </main>
      ) : (
        <main className="conversation-layout">
          <div className="conversation-toolbar">
            <div>
              <span className="eyebrow">Professor de IA</span>
              <h2>{conversation.title}</h2>
            </div>
            <div className="controls">
              {messages.some(
                (message) =>
                  message.role === 'user' && message.state === 'completed',
              ) && (
                <Link
                  className="button secondary small"
                  href={`/provas/nova?conversationId=${id}`}
                >
                  Criar prova desta conversa
                </Link>
              )}
              <label htmlFor="style">Estilo</label>
              <select
                id="style"
                value={conversation.personality}
                disabled={updating}
                onChange={(event) =>
                  void changePersonality(event.target.value as Personality)
                }
              >
                {Object.entries(personalityNames).map(([key, name]) => (
                  <option value={key} key={key}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                className="button danger small"
                onClick={() => void remove()}
              >
                Excluir
              </button>
            </div>
          </div>
          <MaterialsPanel
            conversationId={id}
            conversationVersion={conversation.version}
            onChanged={refresh}
          />
          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty">
                <h3>Comece pela sua dúvida.</h3>
                <p>
                  Pergunte sobre qualquer assunto. Você não precisa enviar
                  materiais para conversar.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <header>
                    {message.role === 'user'
                      ? 'Você'
                      : `Professor de IA · ${personalityNames[message.personality]}`}
                  </header>
                  {message.content && (
                    <div className="body">{message.content}</div>
                  )}
                  {message.references.length > 0 && (
                    <div className="message-references">
                      <strong>Fontes</strong>
                      <ul>
                        {message.references.map((reference) => (
                          <li key={reference.chunkId}>
                            {reference.available ? (
                              <button
                                type="button"
                                className="source-link"
                                onClick={() =>
                                  void showSource(
                                    reference.materialId,
                                    reference.chunkId,
                                    reference.name,
                                  )
                                }
                              >
                                {reference.name},{' '}
                                {locatorLabel(reference.locator)}
                              </button>
                            ) : (
                              <span>Fonte indisponível · {reference.name}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {message.role === 'assistant' &&
                    message.state !== 'completed' && (
                      <div className="status">
                        {message.state === 'failed'
                          ? 'A resposta falhou.'
                          : 'Preparando resposta…'}{' '}
                        {message.state === 'failed' && message.operationId && (
                          <button
                            className="button secondary small"
                            onClick={() => void retry(message.operationId!)}
                          >
                            Tentar novamente
                          </button>
                        )}
                      </div>
                    )}
                </article>
              ))
            )}
          </div>
          {sourcePreview && (
            <aside className="source-preview" aria-label="Trecho da fonte">
              <div className="material-row">
                <strong>
                  {sourcePreview.name} · {locatorLabel(sourcePreview.locator)}
                </strong>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => setSourcePreview(null)}
                >
                  Fechar
                </button>
              </div>
              <p>{sourcePreview.text}</p>
            </aside>
          )}
          <div className="composer-wrap">
            <form className="composer" onSubmit={(event) => void send(event)}>
              <label htmlFor="question" className="eyebrow">
                Sua pergunta
              </label>
              <textarea
                id="question"
                placeholder="Escreva o que você quer entender…"
                value={content}
                maxLength={12000}
                disabled={sending || active}
                onChange={(event) => setContent(event.target.value)}
                required
              />
              <div className="composer-footer">
                <span>
                  {active
                    ? 'Aguarde a resposta para fazer outra pergunta.'
                    : `${content.length}/12.000 caracteres`}
                </span>
                <button
                  className="button"
                  type="submit"
                  disabled={sending || active || !content.trim()}
                >
                  {sending ? 'Enviando…' : 'Enviar pergunta'}
                </button>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </main>
      )}
    </StudyShell>
  );
}
