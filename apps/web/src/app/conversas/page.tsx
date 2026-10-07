'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type { Conversation, Page } from '@study/contracts';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StudyShell } from '../../features/study/StudyShell';
import { api, errorMessage } from '../../lib/api';
import styles from './conversations.module.css';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const personalityNames = {
  acolhedora: 'acolhedor',
  objetiva: 'objetivo',
  socratica: 'socrático',
};

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const reducedMotion = useReducedMotion();

  async function load(next?: string) {
    setError('');
    if (next) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
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
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <StudyShell title="Conversas">
      <main className={`main-content ${styles.page}`}>
        <BlurFade delay={0.06} duration={0.55}>
          <section
            className={styles.hero}
            aria-labelledby="conversations-title"
          >
            <div className={styles.heroCopy}>
              <span className={styles.kicker}>
                <span className={styles.kickerDot} /> SEU ESPAÇO DE DESCOBERTA
              </span>
              <h2 id="conversations-title">
                Toda descoberta começa com <em>uma pergunta.</em>
              </h2>
              <p>
                Converse para entender suas dúvidas, explore as fontes e
                encontre seu jeito de aprender.
              </p>
              <Link className={styles.heroLink} href="/conversas/nova">
                Começar uma conversa <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <motion.div
              className={styles.heroArtwork}
              aria-hidden="true"
              initial={reducedMotion ? false : { opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.65 }}
            >
              <div className={styles.artOrbit} />
              <motion.div
                className={styles.artSheet}
                animate={
                  reducedMotion ? {} : { y: [0, -9, 0], rotate: [5, 3, 5] }
                }
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <span className={styles.artNumber}>01 — CADERNO DE IDEIAS</span>
                <span className={styles.artQuestion}>
                  E se eu perguntar
                  <br />
                  de outro jeito?
                </span>
                <span className={styles.artLine} />
                <span className={styles.artAnswer}>
                  É assim que o entendimento avança.
                </span>
              </motion.div>
              <span className={styles.artSparkle}>✳</span>
            </motion.div>
          </section>
        </BlurFade>

        <BlurFade delay={0.16} duration={0.5}>
          <section
            className={styles.collection}
            aria-labelledby="conversation-list-title"
          >
            <div className={styles.collectionHeading}>
              <div>
                <span className={styles.kicker}>CONTINUE DE ONDE PAROU</span>
                <h2 id="conversation-list-title">
                  Suas conversas<span className={styles.headingPeriod}>.</span>
                </h2>
              </div>
              {!loading && items.length > 0 && (
                <span
                  className={styles.count}
                  aria-label={`${items.length} ${items.length === 1 ? 'conversa' : 'conversas'}`}
                >
                  <NumberTicker value={items.length} aria-hidden="true" />{' '}
                  {items.length === 1 ? 'conversa' : 'conversas'}
                </span>
              )}
            </div>
            {error && (
              <div className={styles.loadError}>
                <p className="form-error" role="alert">
                  {error}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    void load(items.length ? (cursor ?? undefined) : undefined)
                  }
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            {loading ? (
              <div
                className={styles.skeletons}
                aria-busy="true"
                aria-label="Carregando conversas"
              >
                {[0, 1, 2].map((index) => (
                  <div className={styles.skeleton} key={index} />
                ))}
              </div>
            ) : items.length === 0 && !error ? (
              <Card className={styles.emptyCard}>
                <CardContent className={styles.emptyContent}>
                  <div className={styles.emptySymbol} aria-hidden="true">
                    ?
                  </div>
                  <div>
                    <span className={styles.kicker}>O PRIMEIRO CAPÍTULO</span>
                    <h3>O que você quer entender hoje?</h3>
                    <p>
                      Escolha o estilo do professor e faça sua primeira
                      pergunta. Materiais de apoio são opcionais.
                    </p>
                    <div className={styles.promptIdeas}>
                      <span>PARA COMEÇAR</span>
                      <p>
                        “Explique fotossíntese com um exemplo do dia a dia.”
                      </p>
                      <p>“Por que essa fórmula funciona?”</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className={styles.cards}>
                {items.map((item, index) => (
                  <motion.article
                    className={styles.conversationCard}
                    key={item.id}
                    initial={reducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(index, 8) * 0.055,
                      duration: 0.38,
                    }}
                    whileHover={reducedMotion ? {} : { y: -4 }}
                  >
                    <Link
                      className={styles.cardLink}
                      href={`/conversas/${item.id}`}
                      aria-label={`Abrir conversa ${item.title}`}
                    >
                      <span className={styles.cardIndex}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.cardBody}>
                        <strong>{item.title}</strong>
                        <span>
                          Estilo {personalityNames[item.personality]}{' '}
                          <span aria-hidden="true">·</span>{' '}
                          {dateFormatter.format(new Date(item.createdAt))}
                        </span>
                      </span>
                      <span className={styles.cardArrow} aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  </motion.article>
                ))}
              </div>
            )}
            {cursor && (
              <Button
                variant="outline"
                className={styles.moreButton}
                onClick={() => void load(cursor)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais conversas'}
              </Button>
            )}
          </section>
        </BlurFade>
      </main>
    </StudyShell>
  );
}
