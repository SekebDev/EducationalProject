import { z } from 'zod';
import { STUDY_GLYPH_ADVANCES } from './study-font-metrics.ts';

export const studyColors = [
  '#e9ba32',
  '#326a53',
  '#a52d35',
  '#245dab',
] as const;
const coordinate = z.number().finite().min(0).max(14400);
export const studyRectSchema = z.strictObject({
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
});
export const studyPageSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['original', 'tutor']),
  sourcePageIndex: z.number().int().min(0).max(199).nullable(),
  sourcePageId: z.uuid().nullable(),
  title: z.string().max(160),
  width: z.number().min(72).max(14400),
  height: z.number().min(72).max(14400),
  cropX: z.number().finite(),
  cropY: z.number().finite(),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
});
export const studyAnnotationSchema = z.strictObject({
  id: z.uuid(),
  pageId: z.uuid(),
  kind: z.enum(['highlight', 'ellipse', 'arrow', 'pen', 'note']),
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
  points: z.array(z.strictObject({ x: coordinate, y: coordinate })).max(2000),
  text: z.string().max(4000),
  color: z.enum(studyColors),
  strokeWidth: z.number().min(0.5).max(12),
  fontSize: z.number().min(12).max(32),
  author: z.enum(['student', 'tutor']),
  explanationId: z.uuid().nullable(),
});
export const studyLessonStepSchema = z.strictObject({
  id: z.uuid(),
  pageId: z.uuid(),
  lineId: z.string().min(1).max(200),
  text: z.string().max(6000),
  rects: z.array(studyRectSchema).max(100),
  blockIds: z.array(z.string()).max(100),
  explanation: z.string().min(1).max(16000),
  basis: z.enum(['source', 'general', 'unsupported']),
  citedBlockIds: z.array(z.string()).max(100),
  annotationIds: z.array(z.uuid()).max(100),
  pageIds: z.array(z.uuid()).max(12),
});
export const studyLessonSchema = z.strictObject({
  id: z.uuid(),
  pageId: z.uuid(),
  steps: z.array(studyLessonStepSchema).min(1).max(120),
  currentStepIndex: z.number().int().min(0).max(119),
  completed: z.boolean(),
});
export const studyEditorStateSchema = z.strictObject({
  pages: z.array(studyPageSchema).min(1).max(400),
  annotations: z.array(studyAnnotationSchema).max(1500),
  lessons: z.array(studyLessonSchema).max(100).optional(),
  activeLessonId: z.uuid().nullable().optional(),
});
export const studyChangeSchema = z.strictObject({
  operationId: z.uuid(),
  baseRevision: z.number().int().min(0),
  state: studyEditorStateSchema,
});
export const studyHistorySchema = z.strictObject({
  operationId: z.uuid(),
  baseRevision: z.number().int().min(0),
  direction: z.enum(['undo', 'redo']),
});
export const studyAdvanceSchema = z.strictObject({
  operationId: z.uuid(),
  baseRevision: z.number().int().min(0),
  lessonId: z.uuid(),
  stepId: z.uuid(),
});
export const studyQuestionSchema = z.strictObject({
  operationId: z.uuid(),
  baseRevision: z.number().int().min(0),
  pageId: z.uuid(),
  question: z.string().trim().min(1).max(4000),
  selection: z
    .strictObject({
      text: z.string().max(6000),
      rects: z.array(studyRectSchema).max(100),
    })
    .nullable(),
  image: z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable(),
  lessonId: z.uuid().optional(),
  stepId: z.uuid().optional(),
});
export type StudyRect = z.infer<typeof studyRectSchema>;
export type StudyPage = z.infer<typeof studyPageSchema>;
export type StudyAnnotation = z.infer<typeof studyAnnotationSchema>;
export type StudyEditorState = z.infer<typeof studyEditorStateSchema>;
export type StudyChange = z.infer<typeof studyChangeSchema>;
export type StudyQuestion = z.infer<typeof studyQuestionSchema>;
export type StudyAdvance = z.infer<typeof studyAdvanceSchema>;
export type StudyLessonStep = z.infer<typeof studyLessonStepSchema>;
export type StudyLesson = z.infer<typeof studyLessonSchema>;
export type StudyBlock = StudyRect & { id: string; text: string };
export type StudyLine = {
  id: string;
  text: string;
  rects: StudyRect[];
  blockIds: string[];
};
export type StudyTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pageId: string;
  basis: 'source' | 'general' | 'unsupported';
  citedPageIds: string[];
  createdAt: string;
  explanationId: string;
};
export type PdfStudy = {
  materialId: string;
  ownerId: string;
  title: string;
  conversationId: string;
  revision: number;
  state: StudyEditorState;
  turns: StudyTurn[];
  canUndo: boolean;
  canRedo: boolean;
  demo: boolean;
};

// Shared layout uses the advance widths of the embedded Noto Sans font.
// Unknown glyphs occupy a full em and the export rejects unsupported symbols.
export function wrapStudyText(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const available = Math.max(fontSize, width - 1);
  const result: string[] = [];
  for (const paragraph of text.replaceAll('\r', '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      if (line && studyTextWidth(`${line} ${word}`, fontSize) > available) {
        result.push(line);
        line = '';
      }
      const pieces = splitStudyWord(word, available, fontSize);
      if (pieces.length > 1) {
        result.push(...pieces.slice(0, -1));
      }
      const last = pieces.at(-1) ?? '';
      line = line ? `${line} ${last}` : last;
    }
    result.push(line);
  }
  return result;
}

function splitStudyWord(word: string, width: number, fontSize: number) {
  const pieces: string[] = [];
  let piece = '';
  for (const char of word) {
    if (piece && studyTextWidth(piece + char, fontSize) > width) {
      pieces.push(piece);
      piece = '';
    }
    piece += char;
  }
  if (piece) {
    pieces.push(piece);
  }
  return pieces;
}

export function studyTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce(
    (width, char) =>
      width + (STUDY_GLYPH_ADVANCES[char.codePointAt(0)!] ?? 1) * fontSize,
    0,
  );
}

export function studyPointToPdf(
  page: StudyPage,
  point: { x: number; y: number },
) {
  return { x: page.cropX + point.x, y: page.cropY + page.height - point.y };
}

export function validateStudyState(
  state: StudyEditorState,
  originals: StudyPage[],
): string | null {
  const lessonError = validateStudyLessons(state);
  if (lessonError) {
    return lessonError;
  }
  return validateStudyPagesAndAnnotations(state, originals);
}

function validateStudyLessons(state: StudyEditorState): string | null {
  if (
    state.lessons?.some(
      (lesson) =>
        lesson.currentStepIndex >= lesson.steps.length ||
        !state.pages.some((page) => page.id === lesson.pageId) ||
        lesson.steps.some((step) => step.pageId !== lesson.pageId),
    )
  ) {
    return 'Etapa de estudo inválida.';
  }
  if (
    state.activeLessonId &&
    !state.lessons?.some((lesson) => lesson.id === state.activeLessonId)
  ) {
    return 'Aula de estudo não encontrada.';
  }
  return null;
}

function validateStudyPagesAndAnnotations(
  state: StudyEditorState,
  originals: StudyPage[],
): string | null {
  const ids = new Set(state.pages.map((page) => page.id));
  if (
    ids.size !== state.pages.length ||
    new Set(state.annotations.map((item) => item.id)).size !==
      state.annotations.length
  ) {
    return 'IDs duplicados no caderno.';
  }
  const suppliedOriginals = state.pages.filter(
    (page) => page.kind === 'original',
  );
  if (
    JSON.stringify(
      suppliedOriginals.map((page) => studyPageSchema.parse(page)),
    ) !== JSON.stringify(originals.map((page) => studyPageSchema.parse(page)))
  ) {
    return 'As páginas originais não podem ser alteradas.';
  }
  for (const page of state.pages.filter((item) => item.kind === 'tutor')) {
    const source = originals.find((item) => item.id === page.sourcePageId);
    if (
      !source ||
      page.sourcePageIndex !== null ||
      page.cropX !== 0 ||
      page.cropY !== 0 ||
      page.width < 300 ||
      page.height < 400
    ) {
      return 'Referência de página inválida.';
    }
    if (state.pages.indexOf(page) <= state.pages.indexOf(source)) {
      return 'A página de estudo precisa vir após a página original.';
    }
  }
  for (const item of state.annotations) {
    const page = state.pages.find((candidate) => candidate.id === item.pageId);
    if (!page || annotationExceedsPage(item, page)) {
      return 'Desenho fora dos limites da página.';
    }
    if (item.kind === 'note' && noteExceedsBounds(item)) {
      return 'A nota precisa de mais espaço. Crie uma página de estudo.';
    }
    const pathError = validatePath(item);
    if (pathError) {
      return pathError;
    }
  }
  return null;
}

/** Keep planned artifacts saved while revealing only the current/confirmed steps. */
export function visibleStudyState(state: StudyEditorState): StudyEditorState {
  const hiddenAnnotations = new Set<string>();
  const hiddenPages = new Set<string>();
  for (const lesson of state.lessons ?? []) {
    if (lesson.completed) {
      continue;
    }
    for (const step of lesson.steps.slice(lesson.currentStepIndex + 1)) {
      step.annotationIds.forEach((id) => hiddenAnnotations.add(id));
      step.pageIds.forEach((id) => hiddenPages.add(id));
    }
  }
  // Never hide a page containing a student edit or a previously revealed drawing.
  for (const annotation of state.annotations) {
    if (!hiddenAnnotations.has(annotation.id)) {
      hiddenPages.delete(annotation.pageId);
    }
  }
  return {
    ...state,
    pages: state.pages.filter((page) => !hiddenPages.has(page.id)),
    annotations: state.annotations.filter(
      (annotation) =>
        !hiddenAnnotations.has(annotation.id) &&
        !hiddenPages.has(annotation.pageId),
    ),
  };
}

function annotationExceedsPage(item: StudyAnnotation, page: StudyPage) {
  return (
    item.x + item.width > page.width + 0.01 ||
    item.y + item.height > page.height + 0.01 ||
    item.points.some((point) => point.x > page.width || point.y > page.height)
  );
}

function noteExceedsBounds(item: StudyAnnotation) {
  return (
    item.width < 24 ||
    wrapStudyText(item.text, item.width - 16, item.fontSize).length *
      item.fontSize *
      1.4 +
      16 >
      item.height + 0.01
  );
}

function validatePath(item: StudyAnnotation) {
  if (item.kind === 'arrow' && item.points.length !== 2) {
    return 'A seta precisa de dois pontos.';
  }
  if (item.kind === 'pen' && item.points.length < 2) {
    return 'Traço incompleto.';
  }
  return null;
}
