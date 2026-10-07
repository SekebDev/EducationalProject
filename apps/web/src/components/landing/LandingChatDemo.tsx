'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, BookOpen, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import {
  demoConversations,
  demoTeachers,
  type DemoPersonality,
} from './landing-chat-scripts';
import styles from './LandingChatDemo.module.css';

export function LandingChatDemo() {
  const reduced = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [personality, setPersonality] = useState<DemoPersonality>('acolhedora');
  const [turnCount, setTurnCount] = useState(1);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const teacher = demoTeachers.find((item) => item.key === personality)!;
  const turns = demoConversations[personality];
  const busy = answeredCount < turnCount;
  const nextTurn = turns[turnCount];

  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) {
      return;
    }
    const timeout = window.setTimeout(
      () => setAnsweredCount(turnCount),
      reduced ? 0 : 650,
    );
    return () => window.clearTimeout(timeout);
  }, [started, turnCount, personality, revision, reduced]);

  useEffect(() => {
    const element = transcript.current;
    if (!element) {
      return;
    }
    element.scrollTo({
      top: turnCount === 1 ? 0 : element.scrollHeight,
      behavior: reduced || turnCount === 1 ? 'auto' : 'smooth',
    });
  }, [turnCount, answeredCount, personality, revision, reduced]);

  function restart(nextPersonality = personality) {
    setPersonality(nextPersonality);
    setTurnCount(1);
    setAnsweredCount(0);
    setRevision((value) => value + 1);
    setStarted(true);
  }

  return (
    <div className={styles.demo} data-chat-demo ref={frame}>
      <div className={styles.sheet}>
        <Image
          className={styles.paperclip}
          src="/landing/school-kit/images/paperclip.webp"
          width={334}
          height={166}
          sizes="90px"
          alt=""
          draggable={false}
        />
        <div className={styles.header}>
          <span className={styles.brand}>
            <BookOpen size={17} aria-hidden="true" /> Professor de IA
          </span>
          <Button
            type="button"
            variant="ghost"
            className={styles.restart}
            onClick={() => restart()}
            aria-label="Recomeçar exemplo"
            title="Recomeçar exemplo"
          >
            <RotateCcw size={16} aria-hidden="true" />
          </Button>
        </div>
        <div
          className={styles.transcript}
          ref={transcript}
          role="log"
          aria-label="Conversa simulada com o professor de IA"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={busy}
          tabIndex={0}
        >
          {turns.slice(0, turnCount).map((turn, index) => (
            <div
              className={styles.exchange}
              key={`${personality}-${revision}-${index}`}
            >
              <motion.div
                className={styles.question}
                initial={reduced || index === 0 ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <span className={styles.speaker}>Você</span>
                <p>{turn.question}</p>
              </motion.div>
              <div className={styles.answer}>
                <span className={styles.teacherLabel}>
                  Professor <span>· {teacher.name}</span>
                </span>
                {index < answeredCount ? (
                  <motion.div
                    data-demo-answer
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  >
                    {turn.answer.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </motion.div>
                ) : (
                  <div className={styles.typing} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <small>Preparando o exemplo…</small>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.controls}>
          <span className={styles.controlLabel} id="demo-personality-label">
            Como você prefere aprender?
          </span>
          <div
            className={styles.personalities}
            role="group"
            aria-labelledby="demo-personality-label"
          >
            {demoTeachers.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant="ghost"
                className={styles.personality}
                aria-pressed={personality === item.key}
                aria-describedby="demo-personality-description"
                onClick={() => {
                  if (item.key !== personality) {
                    restart(item.key);
                  }
                }}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <p className={styles.description} id="demo-personality-description">
            {teacher.description}
          </p>
          {nextTurn ? (
            <Button
              type="button"
              variant="ghost"
              className={styles.continue}
              onClick={() => setTurnCount((value) => value + 1)}
              disabled={busy}
            >
              <span>
                <small>Continuar o exemplo</small>
                {nextTurn.question}
              </span>
              <span className={styles.sendIcon}>
                <ArrowUp size={18} aria-hidden="true" />
              </span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className={styles.continue}
              disabled={busy}
              onClick={() => restart()}
            >
              <span>
                <small>Exemplo concluído</small>Recomeçar esta conversa
              </span>
              <RotateCcw size={18} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p className={styles.caption}>
        Conversa simulada <span aria-hidden="true">·</span> Troque o estilo para
        abrir outro exemplo.
      </p>
    </div>
  );
}
