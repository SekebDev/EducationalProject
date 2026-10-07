import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { StudyBlock, StudyPage, StudyEditorState } from '@study/contracts';
import { PublicError } from '../../infrastructure/http/public-error.js';

export async function originalStudyPages(
  bytes: Uint8Array,
): Promise<StudyPage[]> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes);
  } catch {
    throw new PublicError(
      422,
      'PDF_UNREADABLE',
      'Use um PDF legível e sem senha.',
    );
  }
  if (document.getPageCount() === 0) {
    throw new PublicError(
      422,
      'PDF_EMPTY',
      'O PDF precisa conter ao menos uma página.',
    );
  }
  if (document.getPageCount() > 200) {
    throw new PublicError(
      413,
      'PDF_PAGE_LIMIT',
      'O caderno aceita até 200 páginas originais.',
    );
  }
  return document.getPages().map((page, index) => {
    const crop = page.getCropBox();
    const media = page.getMediaBox();
    const x = Math.max(crop.x, media.x);
    const y = Math.max(crop.y, media.y);
    const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
    const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
    if (width < 72 || height < 72 || width > 14400 || height > 14400) {
      throw new PublicError(
        422,
        'PDF_PAGE_SIZE',
        'Dimensões de página fora do limite do caderno.',
      );
    }
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation)) {
      throw new PublicError(
        422,
        'PDF_ROTATION',
        'Rotação da página não suportada.',
      );
    }
    return {
      id: randomUUID(),
      kind: 'original',
      sourcePageIndex: index,
      sourcePageId: null,
      title: `Página ${index + 1}`,
      width,
      height,
      cropX: x,
      cropY: y,
      rotation: rotation as StudyPage['rotation'],
    };
  });
}

export async function studyPageBlocks(
  bytes: Uint8Array,
  page: StudyPage,
  state: StudyEditorState,
): Promise<StudyBlock[]> {
  if (page.kind === 'tutor') {
    return state.annotations
      .filter((item) => item.pageId === page.id && item.kind === 'note')
      .map((item) => ({
        id: item.id,
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      }));
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    const pdfPage = await document.getPage(page.sourcePageIndex! + 1);
    const text = await pdfPage.getTextContent();
    const blocks = text.items.flatMap((item, index): StudyBlock[] => {
      if (!('str' in item) || !item.str.trim()) {
        return [];
      }
      const fontHeight = Math.hypot(
        item.transform[2] ?? 0,
        item.transform[3] ?? 0,
      );
      const x = Math.max(0, (item.transform[4] ?? 0) - page.cropX);
      const y = Math.max(
        0,
        page.cropY + page.height - (item.transform[5] ?? 0) - fontHeight,
      );
      if (x >= page.width || y >= page.height) {
        return [];
      }
      return [
        {
          id: `${page.id}:${index}`,
          text: item.str.slice(0, 2000),
          x,
          y,
          width: Math.min(page.width - x, Math.max(0, item.width)),
          height: Math.min(page.height - y, Math.max(0, fontHeight)),
        },
      ];
    });
    return blocks.slice(0, 1200);
  } finally {
    await task.destroy();
  }
}
