'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PdfWorkspaceModel } from './use-pdf-workspace';

export type PdfWorkspaceBridge = {
  ready: boolean;
  busy: boolean;
  blocked: boolean;
  progress: string;
  pageTitle: string;
  selectionText: string;
  hasSelection: boolean;
  demo: boolean;
  lessonActive: boolean;
  currentStepText: string;
  submit(question: string): Promise<boolean>;
  cancel(): Promise<void>;
  clearSelection(): void;
  flush(): Promise<boolean>;
  jumpPage(id: string): void;
};

export function PdfWorkspaceBridgeEmitter({
  model,
  onBridge,
}: {
  model: PdfWorkspaceModel;
  onBridge(bridge: PdfWorkspaceBridge | null): void;
}) {
  const latest = useRef(model);
  latest.current = model;
  const callback = useRef(onBridge);
  callback.current = onBridge;
  const methods = useMemo(
    () => ({
      submit: (question: string) => latest.current.askQuestion(question),
      cancel: async () => {
        latest.current.animation.cancelMotion();
        await latest.current.project.cancel();
      },
      clearSelection: () => latest.current.setSelection(null),
      flush: () => latest.current.project.flush(),
      jumpPage: (id: string) => {
        if (latest.current.visibleState?.pages.some((page) => page.id === id)) {
          latest.current.jump(id);
        }
      },
    }),
    [],
  );
  const ready = Boolean(model.study && model.state && model.page);
  const busy = model.project.busy;
  const blocked = model.blocked;
  const progress = model.project.progress;
  const pageTitle = model.page?.title ?? '';
  const selectionText = model.selection?.text ?? '';
  const hasSelection = Boolean(model.selection?.rects.length);
  const demo = model.study?.demo ?? false;
  const currentStepText = model.animation.step?.text ?? '';
  const lessonActive = Boolean(model.animation.step);
  const emit = useCallback(
    () =>
      callback.current({
        ready,
        busy,
        blocked,
        progress,
        pageTitle,
        selectionText,
        hasSelection,
        demo,
        currentStepText,
        lessonActive,
        ...methods,
      }),
    [
      ready,
      busy,
      blocked,
      progress,
      pageTitle,
      selectionText,
      hasSelection,
      demo,
      currentStepText,
      lessonActive,
      methods,
    ],
  );
  useEffect(() => {
    emit();
  }, [emit]);
  useEffect(() => () => callback.current(null), []);
  return null;
}
