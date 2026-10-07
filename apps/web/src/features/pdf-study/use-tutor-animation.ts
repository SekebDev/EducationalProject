'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyEditorState } from '@study/contracts';
import type { PdfMascotState } from './PdfMascot';

export function useTutorAnimation(
  reduced: boolean,
  visible: boolean,
  jump: (id: string) => void,
  state: StudyEditorState | null,
) {
  const lesson = state?.lessons?.find((item) => item.id === state.activeLessonId && !item.completed);
  const step = lesson?.steps[lesson.currentStepIndex];
  const [pose, setPose] = useState<PdfMascotState>('idle');
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const gesture = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepKey = step ? `${lesson?.id}:${step.id}` : '';
  const cancelMotion = useCallback(() => {
    if (gesture.current) {
      clearTimeout(gesture.current);
      gesture.current = null;
    }
    setPose(stepKey ? 'pointing' : 'idle');
  }, [stepKey]);
  useEffect(() => {
    if (!step) {
      setPose('idle');
      return;
    }
    jumpRef.current(step.pageId);
    if (reduced || !visible) {
      setPose('pointing');
      return;
    }
    setPose('walking');
    gesture.current = setTimeout(() => {
      setPose('pointing');
      gesture.current = null;
    }, 450);
    return () => {
      if (gesture.current) {
        clearTimeout(gesture.current);
        gesture.current = null;
      }
    };
  }, [stepKey, reduced, visible]);
  return {
    lesson,
    step,
    pose,
    cancelMotion,
    target: step?.rects[0] ?? null,
    animating: pose === 'walking',
  };
}
