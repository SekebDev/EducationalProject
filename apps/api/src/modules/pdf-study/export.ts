import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import { studyPointToPdf, wrapStudyText } from '@study/contracts';
import type {
  StudyPage,
  StudyAnnotation,
  StudyEditorState,
} from '@study/contracts';
import { PublicError } from '../../infrastructure/http/public-error.js';

const require = createRequire(import.meta.url);
export function studyFontPath() {
  return require.resolve(
    '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff',
  );
}
const color = (value: string) =>
  rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  );

function drawAnnotation(
  pdf: PDFPage,
  page: StudyPage,
  item: StudyAnnotation,
  font: PDFFont,
) {
  const ink = color(item.color);
  const point = (x: number, y: number) => studyPointToPdf(page, { x, y });
  const position = point(item.x, item.y + item.height);
  if (item.kind === 'highlight') {
    pdf.drawRectangle({
      ...position,
      width: item.width,
      height: item.height,
      color: ink,
      opacity: 0.3,
    });
  }
  if (item.kind === 'ellipse') {
    pdf.drawEllipse({
      ...point(item.x + item.width / 2, item.y + item.height / 2),
      xScale: item.width / 2,
      yScale: item.height / 2,
      borderColor: ink,
      borderWidth: item.strokeWidth,
    });
  }
  if (item.kind === 'note') {
    pdf.drawRectangle({
      ...position,
      width: item.width,
      height: item.height,
      color: rgb(1, 249 / 255, 223 / 255),
      borderColor: ink,
      borderWidth: 0.75,
    });
    const supported = new Set(font.getCharacterSet());
    if (
      Array.from(item.text).some(
        (char) => !/\s/u.test(char) && !supported.has(char.codePointAt(0)!),
      )
    ) {
      throw new PublicError(
        422,
        'PDF_FONT_GLYPH',
        'Uma nota contém símbolos não disponíveis na fonte de exportação. Escreva a fórmula por extenso ou ajuste a nota.',
      );
    }
    wrapStudyText(item.text, item.width - 16, item.fontSize).forEach(
      (line, index) => {
        pdf.drawText(line, {
          ...point(
            item.x + 8,
            item.y + 8 + item.fontSize + index * item.fontSize * 1.4,
          ),
          font,
          size: item.fontSize,
          color: rgb(29 / 255, 53 / 255, 45 / 255),
        });
      },
    );
  }
  if (item.kind === 'pen' || item.kind === 'arrow') {
    const line = (
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) =>
      pdf.drawLine({
        start: point(from.x, from.y),
        end: point(to.x, to.y),
        color: ink,
        thickness: item.strokeWidth,
      });
    for (let index = 1; index < item.points.length; index++) {
      line(item.points[index - 1]!, item.points[index]!);
    }
    if (item.kind === 'arrow') {
      const start = item.points[0]!;
      const end = item.points[1]!;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.max(8, item.strokeWidth * 4);
      for (const offset of [-Math.PI / 6, Math.PI / 6]) {
        line(end, {
          x: end.x - head * Math.cos(angle + offset),
          y: end.y - head * Math.sin(angle + offset),
        });
      }
    }
  }
}

export async function exportStudyPdf(
  original: Uint8Array,
  state: StudyEditorState,
): Promise<Uint8Array> {
  const source = await PDFDocument.load(original);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(await readFile(studyFontPath()), {
    subset: true,
  });
  document.setTitle('Caderno de estudo');
  for (const page of state.pages) {
    const target =
      page.kind === 'original'
        ? document.addPage(
            (await document.copyPages(source, [page.sourcePageIndex!]))[0]!,
          )
        : document.addPage([page.width, page.height]);
    if (page.kind === 'tutor') {
      const related = state.pages.find(
        (candidate) => candidate.id === page.sourcePageId,
      );
      target.drawText(
        `Caderno · Estudo da página ${(related?.sourcePageIndex ?? 0) + 1}`,
        { x: 42, y: 18, size: 10, font, color: rgb(0.34, 0.39, 0.36) },
      );
    }
    for (const item of state.annotations.filter(
      (annotation) => annotation.pageId === page.id,
    )) {
      drawAnnotation(target, page, item, font);
    }
  }
  return document.save();
}
