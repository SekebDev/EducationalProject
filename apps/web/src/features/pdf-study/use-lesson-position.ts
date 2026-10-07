'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StudyPage, StudyRect } from '@study/contracts';
import { boundingRect, normalizedRotation, viewportPoint } from './canvas-geometry';

export function lessonViewportRect(page: StudyPage, rect: StudyRect, rotation: number, zoom: number) {
  const angle = normalizedRotation(page.rotation + rotation);
  const first = viewportPoint(rect, page.width, page.height, angle);
  const last = viewportPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, page.width, page.height, angle);
  const bounds = boundingRect(first, last);
  return { x: bounds.x * zoom, y: bounds.y * zoom, width: bounds.width * zoom, height: bounds.height * zoom };
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(min, max), Math.max(min, value));
}
type View = { left: number; top: number; width: number; height: number };
export function useLessonPosition(
  scrollRef: RefObject<HTMLDivElement | null>,
  frameRef: RefObject<HTMLDivElement | null>,
  page: StudyPage,
  rect: StudyRect | undefined,
  stepId: string | undefined,
  rotation: number,
  zoom: number,
  reduced: boolean,
) {
  const [view, setView] = useState<View>({ left: 0, top: 0, width: 320, height: 400 });
  const lastScroll = useRef('');
  const target = rect ? lessonViewportRect(page, rect, rotation, zoom) : null;
  useEffect(() => {
    const scroll = scrollRef.current;
    const frame = frameRef.current;
    if (!scroll || !frame) {
      return;
    }
    let scheduled = 0;
    function measure() {
      if (!scroll || !frame) {
        return;
      }
      const outer = scroll.getBoundingClientRect();
      const inner = frame.getBoundingClientRect();
      setView({ left: outer.left - inner.left, top: outer.top - inner.top, width: scroll.clientWidth, height: scroll.clientHeight });
    }
    const update = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(measure);
    };
    measure();
    scroll.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    observer.observe(frame);
    return () => {
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      scroll.removeEventListener('scroll', update);
    };
  }, [scrollRef, frameRef, page.id]);
  useEffect(() => {
    const scroll = scrollRef.current;
    const frame = frameRef.current;
    const key = `${stepId}:${page.id}:${rotation}:${zoom}`;
    if (!scroll || !frame || !target || !stepId || lastScroll.current === key) {
      return;
    }
    lastScroll.current = key;
    const outer = scroll.getBoundingClientRect();
    const inner = frame.getBoundingClientRect();
    scroll.scrollTo({
      left: Math.max(0, scroll.scrollLeft + inner.left - outer.left + target.x - 48),
      top: Math.max(0, scroll.scrollTop + inner.top - outer.top + target.y - 32),
      behavior: reduced ? 'instant' : 'smooth',
    });
  }, [stepId, page.id, rotation, zoom, reduced, target?.x, target?.y, scrollRef, frameRef]);
  const width = Math.max(180, Math.min(360, view.width - 24));
  return {
    left: clamp((target?.x ?? 0) - 20, view.left + 12, view.left + view.width - width - 12),
    top: clamp((target?.y ?? 0) + (target?.height ?? 0) + 12, view.top + 12, view.top + view.height - Math.min(280, view.height - 24) - 12),
    width,
    maxHeight: Math.max(120, view.height - 24),
    transitionDuration: reduced ? '0s' : '450ms',
  };
}
