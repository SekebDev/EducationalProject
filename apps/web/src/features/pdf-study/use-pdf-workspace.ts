'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  StudyAnnotation,
  StudyEditorState,
  StudyRect,
  PdfStudy,
  StudyPage,
} from '@study/contracts';
import { validateStudyState, visibleStudyState } from '@study/contracts';
import { api, apiBlob, errorMessage } from '../../lib/api';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import type { PdfTool } from './PdfCanvas';
import type { PdfToolbarProps } from './PdfToolbar';
import type { PageContext } from './use-pdf-page';
import { useStudyProject } from './use-study-project';
import { useTutorAnimation } from './use-tutor-animation';
import { makeStudyPage } from './workspace-state';

export function usePdfWorkspace(
  materialId: string,
  onCompleted?: (() => void | Promise<void>) | undefined,
  onRequestQuestion?: ((question: string) => void) | undefined,
) {
  const [pageId, setPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<PdfTool>('select');
  const [color, setColor] = useState<StudyAnnotation['color']>('#e9ba32');
  const [zoom, setZoom] = useState(0.8);
  const [rotation, setRotation] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    text: string;
    rects: StudyRect[];
  } | null>(null);
  const [showMascot, setShowMascot] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const context = useRef<PageContext>({ blocks: [], image: null });
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || reduceMotion;
  const completions = useRef(0);
  const completionRefresh = useRef<Promise<void>>(Promise.resolve());
  const finished = useCallback(() => {
    completions.current += 1;
    completionRefresh.current = Promise.resolve(onCompleted?.()).catch(
      (cause: unknown) => {
        setNotice(errorMessage(cause));
      },
    );
  }, [onCompleted]);
  const project = useStudyProject(materialId, finished);
  const { study, state } = project;
  const visibleState = state ? visibleStudyState(state) : null;
  const animation = useTutorAnimation(reduced, showMascot, setPageId, state);
  const page =
    visibleState?.pages.find((item) => item.id === pageId) ??
    visibleState?.pages[0];
  const index = visiblePageIndex(visibleState, page);
  const source =
    page?.kind === 'original'
      ? page
      : state?.pages.find((item) => item.id === page?.sourcePageId);
  const blocked =
    project.busy ||
    project.conflict ||
    Boolean(project.retryQuestion) ||
    exporting;
  const updateContext = useCallback((next: PageContext) => {
    context.current = next;
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setSelection(null);
    setRotation(0);
    context.current = { blocks: [], image: null };
  }, [page?.id]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('caderno-pdf-preferences');
      if (stored) {
        const value = JSON.parse(stored) as {
          showMascot?: boolean;
          reduceMotion?: boolean;
        };
        setShowMascot(value.showMascot !== false);
        setReduceMotion(Boolean(value.reduceMotion));
      }
    } catch {
      /* Browser privacy settings may disable preference storage. */
    }
    setZoom(window.innerWidth < 768 ? 0.45 : 0.8);
  }, []);
  function preferences(show: boolean, reduce: boolean) {
    setShowMascot(show);
    setReduceMotion(reduce);
    try {
      localStorage.setItem(
        'caderno-pdf-preferences',
        JSON.stringify({ showMascot: show, reduceMotion: reduce }),
      );
    } catch {
      /* Preferences still work for this visit. */
    }
  }
  function jump(id: string) {
    animation.cancelMotion();
    setPageId(id);
  }
  function change(next: StudyEditorState) {
    if (blocked || exportLock.current || !state) {
      return;
    }
    const invalid = validateStudyState(
      next,
      state.pages.filter((item) => item.kind === 'original'),
    );
    if (invalid) {
      setNotice(invalid);
      return;
    }
    setNotice('');
    project.change(next);
  }
  function addPage() {
    if (blocked || !state || !page) {
      return;
    }
    const created = makeStudyPage(state, page);
    change(created.state);
    jump(created.page.id);
    setTool('note');
  }
  function highlightSelection() {
    if (blocked || !state || !page || !selection) {
      return;
    }
    const group = crypto.randomUUID();
    const annotations: StudyAnnotation[] = selection.rects.map((rect) => ({
      ...rect,
      id: crypto.randomUUID(),
      pageId: page.id,
      kind: 'highlight',
      color,
      strokeWidth: 2,
      fontSize: 14,
      points: [],
      text: '',
      author: 'student',
      explanationId: group,
    }));
    change({ ...state, annotations: [...state.annotations, ...annotations] });
    setSelection(null);
  }
  function removePage() {
    if (blocked || !state || !page || page.kind !== 'tutor' || !source) {
      return;
    }
    if (
      !window.confirm(
        'Excluir esta página de estudo e suas anotações? Você poderá desfazer a ação.',
      )
    ) {
      return;
    }
    change({
      pages: state.pages.filter((item) => item.id !== page.id),
      annotations: state.annotations.filter((item) => item.pageId !== page.id),
    });
    jump(source.id);
  }
  async function exportPdf() {
    if (blocked || exportLock.current) {
      return;
    }
    exportLock.current = true;
    setExporting(true);
    setNotice('');
    try {
      if (!(await project.flush())) {
        return;
      }
      const current = await api<{ revision: number }>(
        `/materials/${materialId}/study`,
      );
      const blob = await apiBlob(
        `/materials/${materialId}/study/export?revision=${current.revision}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${study?.title.replace(/\.pdf$/iu, '') ?? 'caderno'}-estudo.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setNotice(errorMessage(cause));
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }
  async function askQuestion(question: string): Promise<boolean> {
    if (blocked || !page || !question.trim()) {
      return false;
    }
    const before = completions.current;
    animation.cancelMotion();
    const currentStep = animation.step;
    await project.ask({
      question,
      pageId: currentStep?.pageId ?? page.id,
      selection: currentStep
        ? { text: currentStep.text, rects: currentStep.rects }
        : selection,
      image:
        currentStep && currentStep.pageId !== page.id
          ? null
          : context.current.image,
      ...(currentStep && animation.lesson
        ? { lessonId: animation.lesson.id, stepId: currentStep.id }
        : {}),
    });
    await completionRefresh.current;
    return completions.current > before;
  }
  function confirmStep() {
    if (!blocked && animation.lesson && animation.step) {
      void project.advance(animation.lesson.id, animation.step.id);
    }
  }
  function updateAnnotation(annotation: StudyAnnotation) {
    if (state) {
      change({
        ...state,
        annotations: state.annotations.map((item) =>
          item.id === annotation.id ? annotation : item,
        ),
      });
    }
  }
  function createAnnotation(annotation: StudyAnnotation) {
    if (state) {
      change({ ...state, annotations: [...state.annotations, annotation] });
    }
  }
  function removeAnnotation() {
    if (state && selectedId) {
      change({
        ...state,
        annotations: state.annotations.filter((item) => item.id !== selectedId),
      });
      setSelectedId(null);
    }
  }
  const toolbar: PdfToolbarProps = {
    tool,
    setTool,
    color,
    setColor,
    zoom,
    setZoom: (value) => {
      animation.cancelMotion();
      setZoom(value);
    },
    viewRotation: rotation,
    setViewRotation: (value) => {
      animation.cancelMotion();
      setRotation(value);
    },
    saveStatus: exporting ? 'Exportando…' : project.status,
    busy: blocked,
    canUndo: Boolean(study?.canUndo && !project.pending),
    canRedo: Boolean(study?.canRedo && !project.pending),
    onUndo: () => {
      animation.cancelMotion();
      void project.history('undo');
    },
    onRedo: () => {
      animation.cancelMotion();
      void project.history('redo');
    },
    onAddPage: addPage,
    onExport: () => void exportPdf(),
    onDelete: removeAnnotation,
    hasSelection: Boolean(selection?.rects.length),
    onHighlightSelection: highlightSelection,
    showMascot,
    setShowMascot: (value) => preferences(value, reduceMotion),
    reducedMotion: reduced,
    setReducedMotion: (value) => preferences(showMascot, value),
  };
  return {
    materialId,
    project,
    study,
    state,
    visibleState,
    page,
    source,
    index,
    tool,
    color,
    zoom,
    rotation,
    selectedId,
    setSelectedId,
    selection,
    setSelection,
    showMascot,
    reduced,
    showPages,
    setShowPages,
    notice,
    animation,
    blocked,
    toolbar,
    jump,
    updateContext,
    createAnnotation,
    updateAnnotation,
    removePage,
    askQuestion,
    confirmStep,
    requestQuestion: onRequestQuestion,
  };
}
export type PdfWorkspaceModel = ReturnType<typeof usePdfWorkspace>;
function visiblePageIndex(
  state: StudyEditorState | null,
  page: StudyPage | undefined,
) {
  return Math.max(
    0,
    state?.pages.findIndex((item) => item.id === page?.id) ?? 0,
  );
}
export type ReadyWorkspaceModel = PdfWorkspaceModel & {
  study: PdfStudy;
  state: StudyEditorState;
  visibleState: StudyEditorState;
  page: StudyPage;
};
