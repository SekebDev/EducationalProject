'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Conversation, Page } from '@study/contracts';
import { StudyShell } from '../../features/study/StudyShell';
import { api, errorMessage } from '../../lib/api';

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load(next?: string) {
    setError('');
    try {
      const page = await api<Page<Conversation>>(
        `/conversations${next ? `?cursor=${encodeURIComponent(next)}` : ''}`,
      );
      setItems((previous) =>
        next ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <StudyShell title="Conversas">
      <main className="main-content">
        <section className="study-hero" aria-labelledby="study-hero-title">
          <div className="study-hero-copy">
            <span className="eyebrow">Seu espaço de estudo</span>
            <h2 id="study-hero-title">
              Toda descoberta começa com uma pergunta.
            </h2>
            <p>
              Traga uma dúvida, escolha o jeito de aprender e desenvolva a ideia
              com seu professor de IA.
            </p>
            <Link className="button hero-action" href="/conversas/nova">
              Começar conversa <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="study-hero-note" aria-hidden="true">
            <span className="note-index">CADERNO / 01</span>
            <span className="note-question">
              E se eu perguntar de outro jeito?
            </span>
            <span className="note-rule" />
            <span className="note-answer">
              É assim que o entendimento avança.
            </span>
          </div>
        </section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Retome de onde parou</span>
            <h2>Suas conversas</h2>
          </div>
          {!loading && items.length > 0 && (
            <span className="section-count">{items.length} nesta página</span>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p aria-busy="true">Carregando conversas…</p>
        ) : items.length === 0 ? (
          <div className="empty-grid">
            <div className="empty">
              <span className="eyebrow">Primeiro passo</span>
              <h3>O que você quer entender hoje?</h3>
              <p>
                Escolha o estilo do professor e faça sua primeira pergunta. Você
                pode começar sem enviar materiais.
              </p>
              <Link className="button secondary" href="/conversas/nova">
                Criar conversa
              </Link>
            </div>
            <aside className="prompt-note" aria-label="Ideias para começar">
              <span className="eyebrow">Precisa de uma ideia?</span>
              <p>“Explique fotossíntese com um exemplo do dia a dia.”</p>
              <p>“Por que essa fórmula funciona?”</p>
              <p>“Me ajude a revisar antes da prova.”</p>
            </aside>
          </div>
        ) : (
          <div className="list">
            {items.map((item) => (
              <article className="list-item" key={item.id}>
                <div>
                  <Link href={`/conversas/${item.id}`}>{item.title}</Link>
                  <p>
                    Professor {item.personality} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Link
                  className="button secondary small"
                  href={`/conversas/${item.id}`}
                >
                  Abrir
                </Link>
              </article>
            ))}
          </div>
        )}
        {cursor && (
          <button
            className="button secondary"
            onClick={() => void load(cursor)}
          >
            Carregar mais
          </button>
        )}
      </main>
    </StudyShell>
  );
}
