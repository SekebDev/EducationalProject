'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import styles from './ChaosJourney.module.css';

const kit = '/landing/school-kit/images/';
const portion = (value: number, start: number, end: number) =>
  Math.min(1, Math.max(0, (value - start) / (end - start)));
const phases = [
  '',
  'Pergunte a um professor de IA, com explicação acolhedora, objetiva ou socrática.',
  'Envie PDF, DOCX ou TXT e selecione os materiais que vão apoiar a conversa.',
  'Pratique com provas objetivas e discursivas. Revise as correções e explicações de IA.',
];
const papers = [
  {
    kind: 'questionPaper',
    initial: ['-40%', '-110%', -20] as const,
    final: ['-56%', '-48%'] as const,
    range: [0.25, 0.44] as const,
    chaosAsset: 'paper-ruled-cream',
    finalAsset: 'paper-ruled-cream',
    chaos: 'por onde eu\ncomeço???',
    chaosNote: 'tem tanta coisa…',
    title: 'Professor de IA',
    text: 'Por que a luz importa?',
    note: 'Ela fornece energia para a fotossíntese.',
  },
  {
    kind: 'materialPaper',
    initial: ['100%', '-45%', 18] as const,
    final: ['56%', '-48%'] as const,
    range: [0.4, 0.6] as const,
    chaosAsset: 'paper-ruled-warm',
    finalAsset: 'paper-ruled-sage',
    chaos: 'qual foi a\nparte 3?',
    chaosNote: 'era no PDF ou no resumo?',
    title: 'Seus materiais',
    text: 'Biologia · capítulo 03',
    note: 'PDF escolhido para esta conversa.',
  },
  {
    kind: 'examPaper',
    initial: ['-60%', '115%', 14] as const,
    final: ['-56%', '64%'] as const,
    range: [0.55, 0.75] as const,
    chaosAsset: 'paper-yellow',
    finalAsset: 'paper-ruled-ivory',
    chaos: 'li tudo.\nentendi mesmo?',
    chaosNote: 'preciso testar isso.',
    title: 'Hora de praticar',
    text: 'O que a luz faz?',
    note: 'Responda e revise a explicação de IA.',
  },
  {
    kind: 'feedbackPaper',
    initial: ['90%', '145%', -17] as const,
    final: ['56%', '64%'] as const,
    range: [0.68, 0.88] as const,
    chaosAsset: 'paper-pink',
    finalAsset: 'paper-ruled-mint',
    chaos: 'revisar isso\ndepois!!!',
    chaosNote: 'não esquecer (de novo)',
    title: 'Sua evolução',
    text: 'O que revisar agora?',
    note: 'Fotossíntese · Genética. Vale mais uma prática.',
  },
];

function KitImage({
  asset,
  preload = false,
}: {
  asset: string;
  preload?: boolean;
}) {
  return (
    <Image
      src={`${kit}${asset}.webp`}
      alt=""
      fill
      sizes="(max-width: 760px) 160px, 400px"
      preload={preload}
    />
  );
}

function MovingPaper({
  paper,
  progress,
  reduced,
}: {
  paper: (typeof papers)[number];
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const x = useTransform(
    progress,
    [0, paper.range[0], paper.range[1], 1],
    [paper.initial[0], paper.initial[0], paper.final[0], paper.final[0]],
  );
  const y = useTransform(
    progress,
    [0, paper.range[0], paper.range[1], 1],
    [paper.initial[1], paper.initial[1], paper.final[1], paper.final[1]],
  );
  const rotate = useTransform(
    progress,
    [paper.range[0], paper.range[1]],
    [paper.initial[2], 0],
  );
  const chaosTextureOpacity = useTransform(
    progress,
    (value) => 1 - portion(value, paper.range[0], paper.range[1]),
  );
  const finalTextureOpacity = useTransform(progress, (value) =>
    portion(value, paper.range[0], paper.range[1]),
  );
  const chaosOpacity = useTransform(
    progress,
    (value) => 1 - portion(value, paper.range[0] + 0.05, paper.range[0] + 0.11),
  );
  const contentOpacity = useTransform(progress, (value) =>
    portion(value, paper.range[0] + 0.05, paper.range[0] + 0.11),
  );
  return (
    <motion.div
      className={`${styles.paper} ${styles[paper.kind]}`}
      data-study-paper={paper.kind}
      style={reduced ? { rotate: 0 } : { x, y, rotate }}
    >
      <motion.div
        className={styles.paperTexture}
        style={{ opacity: reduced ? 0 : chaosTextureOpacity }}
      >
        <KitImage asset={paper.chaosAsset} preload />
      </motion.div>
      <motion.div
        className={styles.paperTexture}
        style={{ opacity: reduced ? 1 : finalTextureOpacity }}
      >
        <KitImage asset={paper.finalAsset} />
      </motion.div>
      <motion.div
        className={styles.scribbles}
        style={{ opacity: reduced ? 0 : chaosOpacity }}
      >
        <strong>{paper.chaos}</strong>
        <span className={styles.chaosNote}>{paper.chaosNote}</span>
        <span className={styles.scribbleUnderline} />
      </motion.div>
      <motion.div
        className={styles.paperBody}
        style={{ opacity: reduced ? 1 : contentOpacity }}
      >
        <strong className={styles.paperHeading}>{paper.title}</strong>
        <strong className={styles.paperTitle}>{paper.text}</strong>
        <span className={styles.microNote}>{paper.note}</span>
      </motion.div>
    </motion.div>
  );
}

const objects = [
  {
    asset: 'pencil',
    x: '-210%',
    y: '12%',
    initialRotate: -22,
    finalRotate: 10,
  },
  { asset: 'eraser', x: '-65%', y: '400%', initialRotate: 15, finalRotate: -8 },
  {
    asset: 'paperclip',
    x: '160%',
    y: '-515%',
    initialRotate: -15,
    finalRotate: 18,
  },
  {
    asset: 'crumpled-paper',
    x: '100%',
    y: '20%',
    initialRotate: 8,
    finalRotate: 35,
  },
];
function SchoolObject({
  object,
  progress,
  settled,
}: {
  object: (typeof objects)[number];
  progress: MotionValue<number>;
  settled: boolean;
}) {
  const x = useTransform(progress, [0.16, 0.92], ['0%', object.x]);
  const y = useTransform(progress, [0.16, 0.92], ['0%', object.y]);
  const rotate = useTransform(
    progress,
    [0.16, 0.92],
    [object.initialRotate, object.finalRotate],
  );
  const opacity = useTransform(progress, (value) =>
    object.asset === 'crumpled-paper' ? 1 - portion(value, 0.45, 0.85) : 1,
  );
  const objectClass =
    object.asset === 'crumpled-paper' ? styles.crumpled : styles[object.asset];
  return (
    <motion.div
      className={`${styles.schoolObject} ${objectClass}`}
      style={{ x, y, rotate, opacity }}
    >
      <motion.div
        className={styles.objectFloat}
        animate={{ y: settled ? 0 : [0, -7, 0] }}
        transition={{
          duration: settled ? 0.3 : 5,
          repeat: settled ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <KitImage asset={object.asset} />
      </motion.div>
    </motion.div>
  );
}

export function ChaosJourney() {
  const journey = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const { scrollYProgress } = useScroll({
    target: journey,
    offset: ['start start', 'end end'],
  });
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next =
      value < 0.19
        ? 0
        : value < 0.44
          ? 1
          : value < 0.62
            ? 2
            : value < 0.8
              ? 3
              : 4;
    setPhase((current) => (current === next ? current : next));
  });
  const backgroundColor = useTransform(
    scrollYProgress,
    [0, 0.2, 0.43, 1],
    ['#192327', '#192327', '#F1EEDF', '#F1EEDF'],
  );
  const foreground = useTransform(
    scrollYProgress,
    [0.2, 0.43],
    ['#F1EEDF', '#193F34'],
  );
  const warmOpacity = useTransform(scrollYProgress, (value) =>
    portion(value, 0.2, 0.43),
  );
  const chalkOpacity = useTransform(
    scrollYProgress,
    (value) => 1 - portion(value, 0.2, 0.43),
  );
  const introOpacity = useTransform(
    scrollYProgress,
    (value) => 1 - portion(value, 0.13, 0.21),
  );
  const clutterOpacity = useTransform(
    scrollYProgress,
    (value) => 1 - portion(value, 0.35, 0.77),
  );
  const finalOpacity = useTransform(scrollYProgress, (value) =>
    portion(value, 0.79, 0.89),
  );
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section
      ref={journey}
      id="transformacao"
      className={styles.journey}
      data-reduced={reduced || undefined}
      aria-label="Dos estudos espalhados ao próximo passo"
    >
      <h1 className={styles.accessibleTitle}>
        Caderno: do caos escolar a um caminho para estudar.
      </h1>
      <motion.div
        className={styles.stage}
        data-scroll-stage
        data-phase={phase}
        style={{
          backgroundColor: reduced ? '#F1EEDF' : backgroundColor,
          color: reduced ? '#193F34' : foreground,
        }}
      >
        <motion.div
          className={styles.chalkboardBackground}
          data-chaos-background
          aria-hidden="true"
          style={{ opacity: reduced ? 0 : chalkOpacity }}
        >
          <Image
            src={`${kit}chalkboard.webp`}
            alt=""
            fill
            sizes="100vw"
            preload
          />
        </motion.div>
        <motion.div
          className={styles.warmBackground}
          aria-hidden="true"
          style={{ opacity: reduced ? 1 : warmOpacity }}
        >
          <Image
            src={`${kit}warm-paper-background.webp`}
            alt=""
            fill
            sizes="100vw"
          />
        </motion.div>
        <header className={styles.stageHeader}>
          <Link
            href="/"
            className={styles.stageBrand}
            aria-label="Caderno, página inicial"
          >
            Caderno
          </Link>
          <nav className={styles.stageNav} aria-label="Navegação principal">
            <a href="#como-funciona">Como funciona</a>
            <Link href="/entrar">Entrar</Link>
            <Link href="/cadastro" className={styles.navCta}>
              Criar conta
            </Link>
          </nav>
        </header>
        <motion.div
          className={styles.intro}
          data-chaos-intro
          style={{ opacity: reduced ? 0 : introOpacity }}
          inert={reduced || phase !== 0}
          aria-hidden={reduced || phase !== 0}
        >
          <h2 data-hero-heading>
            <span className={styles.heroLine}>Tudo ao</span>
            <span className={`${styles.heroLine} ${styles.heroHighlight}`}>
              mesmo
            </span>
            <span className={styles.heroLine}>tempo.</span>
          </h2>
          <p className={styles.introCopy}>
            Prova. Trabalho. Aula. Resumo. Mais uma aba.
            <br />
            <strong>Role para encontrar um caminho.</strong>
          </p>
          <div className={styles.actions}>
            <Button asChild className={styles.cta}>
              <Link href="/cadastro">
                Começar meu Caderno <ArrowRight size={17} />
              </Link>
            </Button>
          </div>
          <span className={styles.scrollHint}>
            <ArrowDown size={17} /> E se cada coisa encontrasse seu lugar?
          </span>
        </motion.div>
        {!reduced && phase > 0 && phase < 4 && (
          <div className={styles.phaseCopy} aria-hidden="true">
            <h2 className={styles.middleTitle}>
              Cada coisa
              <br />
              no seu lugar.
            </h2>
            <p className={styles.phaseDescription}>{phases[phase]}</p>
          </div>
        )}
        <motion.div
          className={`${styles.phaseCopy} ${styles.finalCopy}`}
          data-final-copy
          style={{ opacity: reduced ? 1 : finalOpacity }}
          inert={!reduced && phase !== 4}
          aria-hidden={!reduced && phase !== 4}
        >
          <h2 className={styles.phaseTitle}>
            Um caminho
            <br />
            para
            <br />
            estudar.
          </h2>
          <p className={styles.finalHighlight}>
            Da dúvida à prática, um passo de cada vez.
          </p>
          <p className={styles.phaseDescription}>
            Professor de IA, seus materiais, provas e evolução por tema.
          </p>
          <div className={styles.finalActions}>
            <Button asChild className={styles.cta}>
              <Link href="/cadastro">
                Começar meu Caderno <ArrowRight size={17} />
              </Link>
            </Button>
            <Link href="/entrar" className={styles.secondary}>
              Já tenho uma conta
            </Link>
          </div>
        </motion.div>
        {!reduced && (
          <motion.div
            style={{ opacity: clutterOpacity }}
            className={styles.extraPapers}
            aria-hidden="true"
          >
            <div className={`${styles.extraPaper} ${styles.extraCream}`}>
              <KitImage asset="paper-ruled-cream" />
              <div className={styles.extraWriting}>
                <strong>Biologia</strong>
                <span>pág. 42 · fotossíntese</span>
                <span>luz = energia?</span>
              </div>
            </div>
            <div className={`${styles.extraPaper} ${styles.extraWarm}`}>
              <KitImage asset="paper-ruled-warm" />
              <div className={styles.extraWriting}>
                <strong>capítulo 03</strong>
                <span>ler de novo!</span>
                <span>cadê o resumo?</span>
              </div>
            </div>
            <div className={`${styles.extraPaper} ${styles.extraLilac}`}>
              <KitImage asset="paper-lilac" />
              <div className={styles.extraWriting}>
                <strong>PROVA AMANHÃ!</strong>
                <span>rever a matéria</span>
                <span>respira. vai dar.</span>
              </div>
            </div>
          </motion.div>
        )}
        <div className={styles.scene} aria-hidden="true">
          {papers.map((paper) => (
            <MovingPaper
              key={paper.kind}
              paper={paper}
              progress={scrollYProgress}
              reduced={reduced}
            />
          ))}
          {!reduced &&
            objects.map((object) => (
              <SchoolObject
                key={object.asset}
                object={object}
                progress={scrollYProgress}
                settled={phase === 4}
              />
            ))}
        </div>
        <motion.div
          className={styles.stageProgress}
          aria-hidden="true"
          style={{ backgroundColor: reduced ? '#F1EEDF' : backgroundColor }}
        >
          <span>Caos</span>
          <div className={styles.progressLine}>
            <motion.div style={{ width: reduced ? '100%' : progressWidth }} />
          </div>
          <span>Clareza</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
