'use client';

import { useRef, type CSSProperties } from 'react';
import {
  wrapStudyText,
  type StudyAnnotation,
  type StudyPage,
} from '@study/contracts';
import {
  normalizedRotation,
  rotationMatrix,
  type Rect,
} from './canvas-geometry';
import { NoteDialog } from './NoteDialog';
import { StudyAnnotationShape } from './StudyAnnotationShape';
import { AnnotationItem } from './AnnotationItem';
import { PageStatus } from './PageStatus';
import { useCanvasTools } from './use-canvas-tools';
import { usePdfPage, type PageContext } from './use-pdf-page';
import styles from './study-editor.module.css';

export type PdfTool =
  | 'select'
  | 'region'
  | 'highlight'
  | 'ellipse'
  | 'arrow'
  | 'pen'
  | 'note'
  | 'move';
export type PdfCanvasProps = {
  materialId: string;
  page: StudyPage;
  annotations: StudyAnnotation[];
  tool: PdfTool;
  color: string;
  zoom: number;
  viewRotation: number;
  selectedAnnotationId: string | null;
  sourcePageNumber?: number | null;
  onSelectAnnotation(id: string | null): void;
  onCreate(annotation: StudyAnnotation): void;
  onUpdate(annotation: StudyAnnotation): void;
  onSelection(selection: { text: string; rects: Rect[] } | null): void;
  onContext(context: PageContext): void;
  focusRects?: Rect[];
};

export function PdfCanvas(props: PdfCanvasProps) {
  const { page, tool, zoom, annotations, selectedAnnotationId } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const rotation = normalizedRotation(page.rotation + props.viewRotation);
  const swapped = rotation === 90 || rotation === 270;
  const viewportWidth = swapped ? page.height : page.width;
  const viewportHeight = swapped ? page.width : page.height;
  const { loading, error, retry } = usePdfPage(
    props.materialId,
    page,
    zoom,
    rotation,
    canvas,
    textLayer,
    props.onContext,
  );
  const {
    gesture,
    draft,
    region,
    note,
    setNote,
    start,
    move,
    finish,
    selectText,
    saveNote,
    cancel,
  } = useCanvasTools(props, surface, loading, error);
  const pageAnnotations = annotations.filter(
    (annotation) => annotation.pageId === page.id,
  );
  const visible = draft
    ? pageAnnotations.map((annotation) =>
        annotation.id === draft.id ? draft : annotation,
      )
    : pageAnnotations;
  const isDrawing = tool !== 'select';

  const textStyle = {
    width: page.width * zoom,
    height: page.height * zoom,
    transform: rotationMatrix(
      page.width * zoom,
      page.height * zoom,
      rotation,
    ).replaceAll(' ', ','),
  } as CSSProperties;
  return (
    <div className={styles.canvasStage}>
      <div
        ref={surface}
        className={styles.pageSurface}
        style={{ width: viewportWidth * zoom, height: viewportHeight * zoom }}
        onMouseUp={selectText}
        onKeyUp={selectText}
        aria-label={page.title}
      >
        {page.kind === 'original' && (
          <canvas
            ref={canvas}
            className={styles.pdfCanvas}
            aria-label="Página original do professor"
          />
        )}
        <div
          ref={textLayer}
          className={`${styles.textLayer} ${tool === 'select' ? '' : styles.textInactive}`}
          style={textStyle}
        />
        <svg
          className={styles.annotationLayer}
          viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          style={{
            pointerEvents: isDrawing ? 'auto' : 'none',
            touchAction: isDrawing ? 'none' : 'auto',
          }}
          aria-label="Anotações da página"
        >
          <g transform={rotationMatrix(page.width, page.height, rotation)}>
            {page.kind === 'tutor' && (
              <>
                <rect width={page.width} height={page.height} fill="#fffefa" />
                <text
                  x={42}
                  y={page.height - 18}
                  fontFamily="Noto Sans Study, sans-serif"
                  fontSize={10}
                  fill="#58645c"
                >
                  {typeof props.sourcePageNumber === 'number'
                    ? `Caderno · Estudo da página ${props.sourcePageNumber}`
                    : 'Caderno · Página de estudo'}
                </text>
              </>
            )}
            {visible.map((item) => (
              <AnnotationItem
                key={item.id}
                annotation={item}
                tool={tool}
                selected={selectedAnnotationId === item.id}
                onSelect={props.onSelectAnnotation}
                onEdit={(annotation) =>
                  setNote({ point: annotation, annotation })
                }
              />
            ))}
            {draft && !gesture.current?.original && (
              <StudyAnnotationShape annotation={draft} />
            )}
            {region && (
              <rect
                {...region}
                fill="#245dab"
                fillOpacity={0.08}
                stroke="#245dab"
                strokeDasharray="5 3"
              />
            )}
            {props.focusRects?.map((rect, index) => (
              <line
                key={index}
                x1={rect.x}
                y1={rect.y + rect.height}
                x2={rect.x + rect.width}
                y2={rect.y + rect.height}
                stroke="#326a53"
                strokeWidth={2.5}
                strokeLinecap="round"
                pointerEvents="none"
                aria-label="Linha atual da explicação"
              />
            ))}
          </g>
        </svg>
        <PageStatus loading={loading} error={error} onRetry={retry} />
      </div>
      {note && (
        <NoteDialog
          initialText={note.annotation?.text ?? ''}
          onSave={saveNote}
          onClose={() => setNote(null)}
          validate={(text) =>
            wrapStudyText(
              text,
              (note.annotation?.width ?? Math.min(260, page.width - 16)) - 16,
              note.annotation?.fontSize ?? 14,
            ).length *
              (note.annotation?.fontSize ?? 14) *
              1.4 +
              16 >
            page.height - 16
              ? 'Esta nota precisa de mais espaço. Reduza o texto ou crie uma página de estudo.'
              : null
          }
        />
      )}
    </div>
  );
}
