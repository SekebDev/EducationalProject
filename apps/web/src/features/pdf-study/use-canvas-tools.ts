'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import { wrapStudyText, type StudyAnnotation } from '@study/contracts';
import {
  boundingRect,
  canonicalPoint,
  canonicalRect,
  normalizedRotation,
  type Point,
  type Rect,
} from './canvas-geometry';
import type { PdfCanvasProps } from './PdfCanvas';

type Gesture = {
  start: Point;
  draft: StudyAnnotation | null;
  original: StudyAnnotation | null;
};

export function useCanvasTools(
  props: PdfCanvasProps,
  surface: RefObject<HTMLDivElement | null>,
  loading: boolean,
  error: string | null,
) {
  const { page, tool, zoom, annotations } = props;
  const rotation = normalizedRotation(page.rotation + props.viewRotation);
  const pageAnnotations = annotations.filter((item) => item.pageId === page.id);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<StudyAnnotation | null>(null);
  const [region, setRegion] = useState<Rect | null>(null);
  const [note, setNote] = useState<{
    point: Point;
    annotation?: StudyAnnotation;
  } | null>(null);
  useEffect(() => {
    gesture.current = null;
    setDraft(null);
    setRegion(null);
    setNote(null);
  }, [page.id]);
  function point(event: PointerEvent): Point {
    const box = surface.current!.getBoundingClientRect();
    const converted = canonicalPoint(
      {
        x: (event.clientX - box.left) / zoom,
        y: (event.clientY - box.top) / zoom,
      },
      page.width,
      page.height,
      rotation,
    );
    return {
      x: Math.max(0, Math.min(page.width, converted.x)),
      y: Math.max(0, Math.min(page.height, converted.y)),
    };
  }
  function annotation(
    kind: StudyAnnotation['kind'],
    start: Point,
  ): StudyAnnotation {
    const colors: StudyAnnotation['color'][] = [
      '#e9ba32',
      '#326a53',
      '#a52d35',
      '#245dab',
    ];
    return {
      id: crypto.randomUUID(),
      pageId: page.id,
      kind,
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
      points: [start],
      text: '',
      color: colors.find((value) => value === props.color) ?? '#326a53',
      strokeWidth: 2,
      fontSize: 14,
      author: 'student',
      explanationId: null,
    };
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || loading || error) {
      return;
    }
    const startPoint = point(event);
    const targetId = (event.target as Element)
      .closest('[data-annotation-id]')
      ?.getAttribute('data-annotation-id');
    const existing =
      pageAnnotations.find((item) => item.id === targetId) ?? null;
    if (tool === 'select' || tool === 'move') {
      props.onSelectAnnotation(existing?.id ?? null);
      if (tool !== 'move' || !existing) {
        return;
      }
      gesture.current = {
        start: startPoint,
        draft: existing,
        original: existing,
      };
    } else if (tool === 'note') {
      setNote({ point: startPoint });
      return;
    } else {
      props.onSelectAnnotation(null);
      gesture.current = {
        start: startPoint,
        draft: tool === 'region' ? null : annotation(tool, startPoint),
        original: null,
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }
    const end = point(event);
    if (!current.draft) {
      setRegion(boundingRect(current.start, end));
      return;
    }
    if (current.original) {
      const original = current.original;
      const dx = Math.max(
        -original.x,
        Math.min(
          page.width - original.x - original.width,
          end.x - current.start.x,
        ),
      );
      const dy = Math.max(
        -original.y,
        Math.min(
          page.height - original.y - original.height,
          end.y - current.start.y,
        ),
      );
      current.draft = {
        ...original,
        x: original.x + dx,
        y: original.y + dy,
        points: original.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    } else if (current.draft.kind === 'pen') {
      const points = [...current.draft.points.slice(0, 1999), end];
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      current.draft = {
        ...current.draft,
        points,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    } else {
      current.draft = {
        ...current.draft,
        ...boundingRect(current.start, end),
        points: [current.start, end],
      };
    }
    setDraft(current.draft);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (
      current.draft &&
      Math.max(current.draft.width, current.draft.height) > 1
    ) {
      if (current.original) {
        props.onUpdate(current.draft);
      } else {
        props.onCreate(current.draft);
      }
    } else if (!current.draft) {
      const rect = boundingRect(current.start, point(event));
      if (rect.width > 2 && rect.height > 2) {
        props.onSelection({ text: '', rects: [rect] });
      }
    }
    setDraft(null);
    setRegion(null);
  }
  function selectText() {
    if (tool !== 'select') {
      return;
    }
    const selection = window.getSelection();
    if (
      !selection ||
      !selection.rangeCount ||
      selection.isCollapsed ||
      !surface.current?.contains(selection.anchorNode)
    ) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!surface.current.contains(selection.focusNode)) {
      return;
    }
    const box = surface.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) =>
        canonicalRect(
          {
            x: (r.left - box.left) / zoom,
            y: (r.top - box.top) / zoom,
            width: r.width / zoom,
            height: r.height / zoom,
          },
          page.width,
          page.height,
          rotation,
        ),
      );
    props.onSelection({
      text: selection.toString().slice(0, 6000),
      rects: rects.slice(0, 100),
    });
  }
  function saveNote(text: string) {
    if (!note) {
      return;
    }
    const width = note.annotation?.width ?? Math.min(260, page.width - 16);
    const fontSize = note.annotation?.fontSize ?? 14;
    const lines = wrapStudyText(text, width - 16, fontSize);
    const height = lines.length * fontSize * 1.4 + 16;
    const value = {
      ...(note.annotation ?? annotation('note', note.point)),
      text,
      width,
      height,
      x: Math.min(note.point.x, page.width - width - 8),
      y: Math.min(note.point.y, page.height - height - 8),
    };
    if (note.annotation) {
      props.onUpdate(value);
    } else {
      props.onCreate(value);
    }
    setNote(null);
  }
  function cancel() {
    gesture.current = null;
    setDraft(null);
    setRegion(null);
  }
  return {
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
  };
}
