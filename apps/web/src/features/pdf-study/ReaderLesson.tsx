import type { RefObject } from 'react';
import { PdfMascot } from './PdfMascot';
import { useLessonPosition } from './use-lesson-position';
import type { ReadyWorkspaceModel } from './use-pdf-workspace';
import styles from './pdf-workspace.module.css';

export function ReaderLesson({ model, scroll, frame }: {
  model: ReadyWorkspaceModel;
  scroll: RefObject<HTMLDivElement | null>;
  frame: RefObject<HTMLDivElement | null>;
}) {
  const { animation, page } = model;
  const { step, lesson } = animation;
  const onLinePage = step?.pageId === page.id;
  const drawing = model.visibleState.annotations.find((item) => item.pageId === page.id && step?.annotationIds.includes(item.id));
  const rect = onLinePage ? step?.rects[0] : drawing;
  const position = useLessonPosition(scroll, frame, page, rect, step?.id, model.rotation, model.zoom, model.reduced);
  if (!step || !lesson) {
    return null;
  }
  const drawingPage = step.pageIds.find((id) => id !== step.pageId && model.visibleState.pages.some((item) => item.id === id));
  return (
    <section
      className={styles.lessonCoach}
      style={position}
      aria-label="Explicação da linha atual"
    >
      {model.showMascot && (
        <div className={styles.lessonMascot}>
          <PdfMascot
            state={model.project.busy ? 'thinking' : onLinePage ? animation.pose : 'drawing'}
            reducedMotion={model.reduced}
          />
        </div>
      )}
      <div className={styles.lessonBubble}>
        <div className={styles.lessonExplanation} aria-live="polite">
          <strong>Linha {lesson.currentStepIndex + 1} de {lesson.steps.length}</strong>
          <blockquote>{step.text}</blockquote>
          <p>{step.explanation}</p>
        </div>
        <div className={styles.lessonOptions}>
          {!onLinePage && (
            <button type="button" onClick={() => model.jump(step.pageId)}>Voltar à linha atual</button>
          )}
          {drawingPage && drawingPage !== page.id && (
            <button type="button" onClick={() => model.jump(drawingPage)}>Ver desenho</button>
          )}
          {model.requestQuestion && (
            <>
              <button type="button" disabled={model.blocked} onClick={() => model.requestQuestion?.('Explique esta linha de outro jeito')}>Explicar de outro jeito</button>
              <button type="button" disabled={model.blocked} onClick={() => model.requestQuestion?.('Desenhe um esquema visual para esta linha')}>Pedir desenho</button>
            </>
          )}
        </div>
        <button className={styles.lessonConfirm} type="button" disabled={model.blocked} onClick={model.confirmStep}>
          {model.project.busy ? 'Aguarde…' : 'Entendi'}
        </button>
        <span className={styles.lessonWaiting}>A próxima linha espera sua confirmação.</span>
      </div>
    </section>
  );
}
