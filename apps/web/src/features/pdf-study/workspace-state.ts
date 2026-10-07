import type {
  StudyAnnotation,
  StudyEditorState,
  StudyPage,
} from '@study/contracts';

export function makeStudyPage(state: StudyEditorState, page: StudyPage) {
  const source =
    page.kind === 'original'
      ? page
      : state.pages.find((item) => item.id === page.sourcePageId)!;
  const extra: StudyPage = {
    id: crypto.randomUUID(),
    kind: 'tutor',
    sourcePageIndex: null,
    sourcePageId: source.id,
    title: 'Minhas anotações',
    width: 595,
    height: 842,
    cropX: 0,
    cropY: 0,
    rotation: 0,
  };
  const pages = [...state.pages];
  let index = pages.indexOf(source) + 1;
  while (pages[index]?.sourcePageId === source.id) {
    index++;
  }
  pages.splice(index, 0, extra);
  const title: StudyAnnotation = {
    id: crypto.randomUUID(),
    pageId: extra.id,
    kind: 'note',
    x: 42,
    y: 42,
    width: 511,
    height: 42,
    text: 'Minhas anotações',
    points: [],
    color: '#326a53',
    strokeWidth: 2,
    fontSize: 18,
    author: 'student',
    explanationId: null,
  };
  return {
    state: { pages, annotations: [...state.annotations, title] },
    page: extra,
  };
}
