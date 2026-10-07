import { randomUUID } from 'node:crypto';
import { wrapStudyText } from '@study/contracts';
import type {
  StudyAnnotation,
  StudyEditorState,
  StudyPage,
  StudyRect,
} from '@study/contracts';
import type { TutorPlan } from './tutor.js';

const COLOR = '#326a53' as const;
const FONT = 14;
const LINE = 19.6;
const MARGIN = 42;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const NOTE_PADDING = 8;

function originalForPage(
  current: StudyEditorState,
  target: StudyPage,
): StudyPage {
  if (target.kind === 'original') {
    return target;
  }
  const source = current.pages.find(
    (page) => page.id === target.sourcePageId && page.kind === 'original',
  );
  if (!source) {
    throw new Error('STUDY_SOURCE_PAGE_NOT_FOUND');
  }
  return source;
}

function insertionIndex(pages: StudyPage[], source: StudyPage): number {
  let index = pages.indexOf(source) + 1;
  while (
    pages[index]?.kind === 'tutor' &&
    pages[index]?.sourcePageId === source.id
  ) {
    index++;
  }
  return index;
}

/** Only verified source-block coordinates may produce marks on the PDF. */
export function applyTutorPlan(
  current: StudyEditorState,
  pageId: string,
  _selection: { text: string; rects: StudyRect[] } | null,
  plan: TutorPlan,
  explanationId: string,
): { state: StudyEditorState; annotationIds: string[]; pageIds: string[] } {
  const target = current.pages.find((page) => page.id === pageId);
  if (!target) {
    throw new Error('STUDY_PAGE_NOT_FOUND');
  }
  const source = originalForPage(current, target);
  const pages = [...current.pages];
  const annotations = [...current.annotations];
  const annotationIds: string[] = [];
  const pageIds: string[] = [];
  const add = (
    value: Omit<StudyAnnotation, 'id' | 'author' | 'explanationId'>,
  ) => {
    const annotation: StudyAnnotation = {
      ...value,
      id: randomUUID(),
      author: 'tutor',
      explanationId,
    };
    annotations.push(annotation);
    annotationIds.push(annotation.id);
    return annotation;
  };
  const base = {
    points: [],
    text: '',
    color: COLOR,
    strokeWidth: 2,
    fontSize: FONT,
  };
  const blockById = new Map(
    plan.sourceBlocks.map((block) => [block.id, block]),
  );
  const rect = (id: string): StudyRect | null => {
    const block = blockById.get(id);
    if (
      !block ||
      ![block.x, block.y, block.width, block.height].every(Number.isFinite)
    ) {
      return null;
    }
    const x = Math.max(0, block.x);
    const y = Math.max(0, block.y);
    const width = Math.min(target.width, block.x + block.width) - x;
    const height = Math.min(target.height, block.y + block.height) - y;
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  };
  for (const id of new Set(plan.citedBlockIds)) {
    const bounds = rect(id);
    if (bounds) {
      add({
        ...base,
        ...bounds,
        pageId: target.id,
        kind: 'highlight',
        color: '#e9ba32',
      });
    }
  }
  for (const shape of plan.shapes) {
    const bounds = rect(shape.blockId);
    if (!bounds) {
      continue;
    }
    if (shape.kind === 'ellipse') {
      add({ ...base, ...bounds, pageId: target.id, kind: 'ellipse' });
    } else {
      const end = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      const start = { x: Math.max(0, bounds.x - 24), y: end.y };
      if (end.x > start.x) {
        add({
          ...base,
          pageId: target.id,
          kind: 'arrow',
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: 0,
          points: [start, end],
        });
      }
    }
  }
  let insertAt = insertionIndex(pages, source);
  let active: StudyPage | null = null;
  let cursor = MARGIN;
  const newPage = () => {
    active = {
      id: randomUUID(),
      kind: 'tutor',
      sourcePageIndex: null,
      sourcePageId: source.id,
      title: `${plan.title}${pageIds.length ? ` (${pageIds.length + 1})` : ''}`,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      cropX: 0,
      cropY: 0,
      rotation: 0,
    };
    pages.splice(insertAt++, 0, active);
    pageIds.push(active.id);
    cursor = MARGIN;
    const titleLines = wrapStudyText(
      plan.title,
      PAGE_WIDTH - MARGIN * 2 - NOTE_PADDING * 2,
      18,
    );
    const titleHeight = titleLines.length * 25.2 + NOTE_PADDING * 2;
    add({
      ...base,
      pageId: active.id,
      kind: 'note',
      x: MARGIN,
      y: cursor,
      width: PAGE_WIDTH - MARGIN * 2,
      height: titleHeight,
      text: titleLines.join('\n'),
      fontSize: 18,
    });
    cursor += titleHeight + 20;
  };
  const write = (text: string): StudyAnnotation[] => {
    const lines = wrapStudyText(
      text,
      PAGE_WIDTH - MARGIN * 2 - NOTE_PADDING * 2,
      FONT,
    );
    const written: StudyAnnotation[] = [];
    let offset = 0;
    while (offset < lines.length) {
      if (!active || PAGE_HEIGHT - MARGIN - cursor < LINE + NOTE_PADDING * 2) {
        newPage();
      }
      const lineCount = Math.max(
        1,
        Math.floor((PAGE_HEIGHT - MARGIN - cursor - NOTE_PADDING * 2) / LINE),
      );
      const chunk = lines.slice(offset, offset + lineCount);
      written.push(
        add({
          ...base,
          pageId: active!.id,
          kind: 'note',
          x: MARGIN,
          y: cursor,
          width: PAGE_WIDTH - MARGIN * 2,
          height: chunk.length * LINE + NOTE_PADDING * 2,
          text: chunk.join('\n'),
        }),
      );
      cursor += chunk.length * LINE + NOTE_PADDING * 2 + 18;
      offset += chunk.length;
    }
    return written;
  };
  // Answer always remains complete in the exported PDF, including when notes are summaries.
  write(plan.answer);
  for (const note of plan.notes) {
    if (note.text.trim() !== plan.answer.trim()) {
      write(note.text);
    }
  }
  if (plan.diagram?.nodes.length) {
    newPage();
    const nodes = plan.diagram.nodes.map(
      (text, index) => write(`${index + 1}. ${text}`)[0]!,
    );
    for (const edge of plan.diagram.edges) {
      const from = nodes[edge.from];
      const to = nodes[edge.to];
      if (!from || !to) {
        continue;
      }
      // Keep every relation readable even when long labels span multiple pages.
      write(`Ligação: ${edge.from + 1} para ${edge.to + 1}`);
      if (from.pageId === to.pageId && from.id !== to.id) {
        const start = { x: from.x - 12, y: from.y + from.height / 2 };
        const end = { x: to.x - 12, y: to.y + to.height / 2 };
        add({
          ...base,
          pageId: from.pageId,
          kind: 'arrow',
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
          points: [start, end],
        });
      }
    }
  }
  return { state: { pages, annotations }, annotationIds, pageIds };
}
