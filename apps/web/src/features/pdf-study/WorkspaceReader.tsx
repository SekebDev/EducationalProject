import { Trash2 } from 'lucide-react';
import { useRef, type CSSProperties } from 'react';
import { PdfCanvas } from './PdfCanvas';
import { PdfMascot } from './PdfMascot';
import { WorkspaceNoteEditor } from './WorkspaceNoteEditor';
import { normalizedRotation, viewportPoint } from './canvas-geometry';
import type { ReadyWorkspaceModel } from './use-pdf-workspace';
import styles from './pdf-workspace.module.css';
import { ReaderLesson } from './ReaderLesson';

function ReaderMascot({ model }: { model: ReadyWorkspaceModel }) {
  const { page, animation, rotation, zoom } = model;
  const viewingRotation = normalizedRotation(page.rotation + rotation);
  const swapped = viewingRotation === 90 || viewingRotation === 270;
  const width = (swapped ? page.height : page.width) * zoom;
  const height = (swapped ? page.width : page.height) * zoom;
  const target = animation.target
    ? viewportPoint(animation.target, page.width, page.height, viewingRotation)
    : null;
  const mascotStyle: CSSProperties = {
    left: width + 48,
    top: target
      ? Math.max(16, Math.min(height - 84, target.y * zoom + 32))
      : 24,
    transitionDuration: model.reduced ? '0s' : '0.45s',
  };
  return (
    <div className={styles.floatingMascot} style={mascotStyle}>
      <PdfMascot
        state={model.project.busy ? 'thinking' : animation.pose}
        reducedMotion={model.reduced}
      />
      <span>
        {model.project.busy
          ? 'Pensando…'
          : animation.animating
            ? 'Vamos acompanhar?'
            : 'Estou por aqui'}
      </span>
    </div>
  );
}

export function WorkspaceReader({ model }: { model: ReadyWorkspaceModel }) {
  const { page, source, animation, visibleState, project } = model;
  const scroll = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const onLessonPage = animation.step?.pageId === page.id;
  const note = visibleState.annotations.find(
    (item) => item.id === model.selectedId && item.kind === 'note',
  );
  const pageLabel =
    page.kind === 'original'
      ? `Material do professor · Página ${(page.sourcePageIndex ?? 0) + 1}`
      : `${page.title} · Após a página ${(source?.sourcePageIndex ?? 0) + 1}`;
  return (
    <div className={styles.reader}>
      <div className={styles.pageHeading}>
        <span>{pageLabel}</span>
        {page.kind === 'tutor' && (
          <button disabled={model.blocked} onClick={model.removePage}>
            <Trash2 size={14} aria-hidden="true" /> Excluir página
          </button>
        )}
      </div>
      <div
        ref={scroll}
        className={styles.scrollPage}
        data-lesson-active={Boolean(animation.step)}
      >
        <div
          className={styles.pageFrame}
          ref={frame}
          data-mascot-visible={model.showMascot && !animation.step}
        >
          <div
            className={model.blocked ? styles.locked : ''}
            aria-busy={project.busy}
          >
            <PdfCanvas
              materialId={model.materialId}
              page={page}
              annotations={visibleState.annotations}
              focusRects={onLessonPage ? (animation.step?.rects ?? []) : []}
              tool={model.tool}
              color={model.color}
              zoom={model.zoom}
              viewRotation={model.rotation}
              sourcePageNumber={(source?.sourcePageIndex ?? 0) + 1}
              selectedAnnotationId={model.selectedId}
              onSelectAnnotation={model.setSelectedId}
              onCreate={model.createAnnotation}
              onUpdate={model.updateAnnotation}
              onSelection={model.setSelection}
              onContext={model.updateContext}
            />
          </div>
          {model.showMascot && !animation.step && (
            <ReaderMascot model={model} />
          )}
          <ReaderLesson model={model} scroll={scroll} frame={frame} />
        </div>
      </div>
      {note && (
        <WorkspaceNoteEditor
          key={note.id}
          annotation={note}
          page={page}
          disabled={model.blocked}
          onSave={model.updateAnnotation}
        />
      )}
      <p className={styles.readerHint}>
        Selecione texto ou uma área para perguntar. Use “Mover anotação” para
        editar ou reposicionar um desenho.
      </p>
    </div>
  );
}
