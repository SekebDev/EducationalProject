'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type { Conversation, Personality } from '@study/contracts';
import { BlurFade } from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StudyShell } from '../../../features/study/StudyShell';
import { api, errorMessage } from '../../../lib/api';
import styles from '../conversation-flow.module.css';

const personalities: Array<{
  key: Personality;
  name: string;
  description: string;
}> = [
  {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e usa exemplos próximos de você.',
  },
  {
    key: 'objetiva',
    name: 'Objetiva',
    description:
      'Vai direto ao conceito, com respostas organizadas em passos curtos.',
  },
  {
    key: 'socratica',
    name: 'Socrática',
    description:
      'Ajuda você a pensar com perguntas antes de resumir a explicação.',
  },
];

export default function NewConversationPage() {
  const router = useRouter();
  const [personality, setPersonality] = useState<Personality>('acolhedora');
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const reducedMotion = useReducedMotion();
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
      <main className={`main-content ${styles.newPage}`}>
        <BlurFade delay={0.05} duration={0.5}>
          <Link className={styles.backLink} href="/conversas">
            <span aria-hidden="true">←</span> Voltar às conversas
          </Link>
          <div className={styles.newHeading}>
            <span className={styles.kicker}>01 / NOVA CONVERSA</span>
            <h2>
              Aprender começa com
              <br />
              <em>uma boa conversa.</em>
            </h2>
            <p>
              Escolha o jeito de ensinar que combina com você. Você pode mudar
              depois.
            </p>
          </div>
        </BlurFade>
        <motion.form
          className={styles.newForm}
          onSubmit={(event) => void submit(event)}
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <fieldset className={styles.fieldset} disabled={pending}>
            <legend className={styles.legend}>
              Como você prefere aprender?
            </legend>
            <p className={styles.fieldHint}>
              Não existe escolha errada. Encontre a voz que combina com você.
            </p>
            <div className={styles.personalityGrid}>
              {personalities.map((item) => (
                <motion.label
                  className={styles.personalityCard}
                  key={item.key}
                  whileHover={reducedMotion || pending ? {} : { y: -5 }}
                  whileTap={reducedMotion || pending ? {} : { scale: 0.98 }}
                  transition={{ duration: 0.22 }}
                >
                  <input
                    type="radio"
                    name="personality"
                    value={item.key}
                    checked={personality === item.key}
                    onChange={() => setPersonality(item.key)}
                  />
                  <span className={styles.cardTop}>
                    <span className={styles.personalityIcon} aria-hidden="true">
                      {item.key === 'acolhedora'
                        ? '✳'
                        : item.key === 'objetiva'
                          ? '↗'
                          : '?'}
                    </span>
                    <span className={styles.radioIndicator} />
                  </span>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </motion.label>
              ))}
            </div>
          </fieldset>
          <Card className={styles.titleCard}>
            <CardContent className={styles.titleContent}>
              <label htmlFor="conversation-title">
                Dê um nome à conversa <span>(opcional)</span>
              </label>
              <input
                id="conversation-title"
                maxLength={120}
                placeholder="Ex.: Revisão de biologia"
                value={title}
                disabled={pending}
                onChange={(event) => setTitle(event.target.value)}
              />
              <p>Você pode deixar o nome para depois e começar agora.</p>
            </CardContent>
          </Card>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button className={styles.submit} type="submit" disabled={pending}>
              {pending ? 'Criando sua conversa…' : 'Começar conversa'}{' '}
              <span aria-hidden="true">↗</span>
            </Button>
          </div>
        </motion.form>
      </main>
    </StudyShell>
  );
}
