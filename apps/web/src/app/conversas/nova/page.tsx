'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Conversation, Personality } from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';

const personalities: Array<{
  key: Personality;
  name: string;
  description: string;
}> = [
  {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e usa exemplos próximos do estudante.',
  },
  {
    key: 'objetiva',
    name: 'Objetiva',
    description:
      'Vai direto ao conceito e organiza a resposta em passos curtos.',
  },
  {
    key: 'socratica',
    name: 'Socrática',
    description: 'Conduz o raciocínio com perguntas antes da síntese.',
  },
];

export default function NewConversationPage() {
  const router = useRouter();
  const [personality, setPersonality] = useState<Personality>('acolhedora');
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const conversation = await api<Conversation>('/conversations', {
        method: 'POST',
        idempotent: true,
        body: { personality, ...(title.trim() ? { title: title.trim() } : {}) },
      });
      window.dispatchEvent(new Event('conversations-changed'));
      router.push(`/conversas/${conversation.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }
  return (
    <StudyShell title="Nova conversa">
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Começar a estudar</span>
            <h2>Escolha seu professor</h2>
            <p>O estilo pode mudar depois, sem perder o histórico.</p>
          </div>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700 }}>
              Como você prefere aprender?
            </legend>
            <div className="personality-grid">
              {personalities.map((item) => (
                <label className="personality-card" key={item.key}>
                  <input
                    type="radio"
                    name="personality"
                    value={item.key}
                    checked={personality === item.key}
                    onChange={() => setPersonality(item.key)}
                  />
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field" style={{ maxWidth: 550 }}>
            <label htmlFor="conversation-title">
              Nome da conversa <span className="hint">(opcional)</span>
            </label>
            <input
              id="conversation-title"
              maxLength={120}
              placeholder="Ex.: Revisão de biologia"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Criando…' : 'Começar conversa'}
          </button>{' '}
          <Link className="button ghost" href="/conversas">
            Voltar
          </Link>
        </form>
      </main>
    </StudyShell>
  );
}
