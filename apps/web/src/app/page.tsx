import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCheck,
  FileText,
  Paperclip,
  PencilLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChaosJourney } from '@/components/landing/ChaosJourney';
import { LandingChatDemo } from '@/components/landing/LandingChatDemo';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'Caderno — um caminho mais claro para estudar',
  description:
    'Pergunte a um professor de IA, estude com seus materiais, pratique com provas e acompanhe sua evolução por tema no Caderno.',
  openGraph: {
    title: 'Caderno — um caminho mais claro para estudar',
    description:
      'Da primeira dúvida à próxima prática: professor de IA, seus materiais e evolução por tema em um só lugar.',
    type: 'website',
    locale: 'pt_BR',
  },
};

function Brand() {
  return (
    <Link
      className={styles.brand}
      href="/"
      aria-label="Caderno, página inicial"
    >
      Caderno
    </Link>
  );
}

function StartLink({ light = false }: { light?: boolean }) {
  return (
    <Button asChild size="lg" className={light ? styles.ctaLight : styles.cta}>
      <Link href="/cadastro">
        Começar meu Caderno <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </Button>
  );
}

export default function HomePage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#conteudo">
        Ir para o conteúdo
      </a>
      <main id="conteudo">
        <ChaosJourney />

        <section
          className={`${styles.chapter} ${styles.question}`}
          id="como-funciona"
          aria-labelledby="question-title"
        >
          <div className={styles.chapterCopy}>
            <h2 id="question-title">
              Uma boa
              <br /> pergunta abre
              <br /> o caminho.
            </h2>
            <p>
              Escolha o estilo da explicação e converse sobre a dúvida que está
              na sua cabeça.
            </p>
            <p className={styles.questionHint}>
              Você pode começar sem enviar arquivos.
            </p>
            <span className={styles.chapterNote}>
              Uma pergunta já é um começo.
            </span>
          </div>
          <LandingChatDemo />
        </section>

        <section
          className={`${styles.chapter} ${styles.materials}`}
          aria-labelledby="materials-title"
        >
          <div
            className={styles.materialsScene}
            aria-label="Materiais enviados e selecionados"
          >
            <div className={styles.fileBoard}>
              <div className={styles.fileBoardHead}>
                <Paperclip size={19} aria-hidden="true" /> Materiais da conversa
              </div>
              <div className={styles.fileRow}>
                <span className={styles.fileType}>PDF</span>
                <span>capítulo-fotossíntese.pdf</span>
                <Check size={17} aria-hidden="true" />
              </div>
              <div className={styles.fileRow}>
                <span className={styles.fileType}>TXT</span>
                <span>anotações.txt</span>
                <FileText size={17} aria-hidden="true" />
              </div>
              <div className={styles.fileRow}>
                <span className={styles.fileType}>DOCX</span>
                <span>resumo.docx</span>
                <Check size={17} aria-hidden="true" />
              </div>
              <div className={styles.fileBoardFoot}>
                2 arquivos selecionados para esta conversa
              </div>
            </div>
            <span className={styles.fileAnnotation}>
              os seus arquivos,
              <br /> na mesma conversa.
            </span>
          </div>
          <div className={styles.chapterCopy}>
            <h2 id="materials-title">
              Tudo o que você trouxe.
              <br />
              <em>Bem aqui.</em>
            </h2>
            <p>
              Envie PDF, DOCX ou TXT e selecione o que quer usar como apoio.
              Assim, você estuda a partir do conteúdo que trouxe, com
              referências aos arquivos enviados.
            </p>
            <p className={styles.materialsAside}>
              Você escolhe o que enviar. Sem arquivo, ainda dá para perguntar.
            </p>
          </div>
        </section>

        <section
          className={`${styles.chapter} ${styles.practice}`}
          aria-labelledby="practice-title"
        >
          <div className={styles.chapterCopy}>
            <h2 id="practice-title">
              Entendeu?
              <br />
              <em>Agora tenta.</em>
            </h2>
            <p>
              Crie uma prova com questões objetivas e discursivas. Depois de
              responder, revise a correção e as explicações geradas por IA para
              entender onde errou e por quê.
            </p>
          </div>
          <div
            className={styles.practiceScene}
            aria-label="Questão e correção por IA"
          >
            <article className={styles.questionPaper}>
              <span className={styles.paperTop}>
                <PencilLine size={16} aria-hidden="true" /> Prova de prática
              </span>
              <h3>Qual é o papel da luz na fotossíntese?</h3>
              <div className={styles.answerLine}>
                <span className={styles.handLabel}>minha resposta</span>
                Fornece energia para iniciar as reações.
              </div>
            </article>
            <article className={styles.correctionPaper}>
              <span className={styles.paperTop}>
                <CheckCheck size={16} aria-hidden="true" /> Correção por IA
              </span>
              <strong>Boa linha de raciocínio.</strong>
              <p>
                A resposta identifica a função da luz. Na revisão, vale explicar
                também o que acontece com essa energia nas etapas seguintes.
              </p>
            </article>
          </div>
        </section>

        <section
          className={`${styles.chapter} ${styles.evolution}`}
          aria-labelledby="evolution-title"
        >
          <div className={styles.evolutionHeading}>
            <h2 id="evolution-title">
              Olha o quanto
              <br />
              <em>já fez sentido.</em>
            </h2>
            <p>
              Acompanhe sua evolução por tema e retome a prática nos pontos que
              precisam de atenção.
            </p>
          </div>
          <div className={styles.progressBoard} aria-label="Evolução por tema">
            <div className={styles.progressHead}>
              <span>Evolução por tema</span>
            </div>
            <div className={styles.progressRow}>
              <div>
                <strong>Fotossíntese</strong>
                <span>Continue revisando</span>
              </div>
              <span className={styles.progressTrack}>
                <span style={{ width: '64%' }} />
              </span>
            </div>
            <div className={styles.progressRow}>
              <div>
                <strong>Ecossistemas</strong>
                <span>Bom avanço</span>
              </div>
              <span className={styles.progressTrack}>
                <span style={{ width: '84%' }} />
              </span>
            </div>
            <div className={styles.progressRow}>
              <div>
                <strong>Genética</strong>
                <span>Vale praticar mais</span>
              </div>
              <span className={styles.progressTrack}>
                <span style={{ width: '38%' }} />
              </span>
            </div>
            <div className={styles.nextStep}>
              <span>Um próximo passo</span>
              <strong>Pratique o tema que pede mais atenção.</strong>
              <ArrowRight size={20} aria-hidden="true" />
            </div>
          </div>
          <p className={styles.illustrativeNote}>
            Dados fictícios usados apenas para mostrar como a evolução aparece
            no Caderno.
          </p>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div className={styles.closingCopy}>
            <h2 id="closing-title">
              A próxima página
              <br />é sua.
            </h2>
            <p>
              Traga sua dúvida, estude com seus materiais, pratique e acompanhe
              o caminho que você constrói.
            </p>
            <StartLink />
          </div>
          <div className={styles.closingPaper}>
            <span>meu Caderno</span>
            <strong>
              por onde
              <br />
              eu começo?
            </strong>
            <p>
              Por uma pergunta.
              <br />O resto, a gente constrói.
            </p>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <span>Um espaço individual para estudar.</span>
        <Link href="/entrar">Entrar</Link>
      </footer>
    </div>
  );
}
