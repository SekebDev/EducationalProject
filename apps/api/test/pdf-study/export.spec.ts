import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { degrees, PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { validateStudyState } from '@study/contracts';
import type { StudyAnnotation, StudyEditorState } from '@study/contracts';
import { exportStudyPdf } from '../../src/modules/pdf-study/export.js';
import {
  originalStudyPages,
  studyPageBlocks,
} from '../../src/modules/pdf-study/pdf-context.js';
import { applyTutorPlan } from '../../src/modules/pdf-study/tutor-layout.js';

async function sourcePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([595, 842]);
  first.drawText('Professor: introducao ao estudo', {
    x: 60,
    y: 720,
    font,
    size: 16,
  });
  first.drawRectangle({
    x: 70,
    y: 600,
    width: 100,
    height: 50,
    borderWidth: 2,
    borderColor: rgb(0, 0, 0),
  });
  const second = pdf.addPage([640, 850]);
  second.setCropBox(20, 30, 590, 800);
  second.setRotation(degrees(90));
  second.drawText('Professor: pagina com rotacao e recorte', {
    x: 60,
    y: 690,
    font,
    size: 14,
  });
  return pdf.save();
}

async function inspectPdf(bytes: Uint8Array) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const text = (await page.getTextContent()).items
        .flatMap((item) => ('str' in item ? [item.str] : []))
        .join(' ');
      const operators = (await page.getOperatorList()).fnArray;
      pages.push({ text, operators, rotation: page.rotate, view: page.view });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

function note(pageId: string, text: string): StudyAnnotation {
  return {
    id: randomUUID(),
    pageId,
    kind: 'note',
    x: 70,
    y: 150,
    width: 420,
    height: 180,
    text,
    color: '#326a53',
    strokeWidth: 2,
    fontSize: 14,
    points: [],
    author: 'student',
    explanationId: null,
  };
}

describe('PDF study export', () => {
  it('preserves the vector source pages, crop, rotation and Portuguese annotations', async () => {
    const source = await sourcePdf();
    const originals = await originalStudyPages(source);
    const state: StudyEditorState = {
      pages: originals,
      annotations: [
        note(
          originals[0]!.id,
          'Atenção: explicação, compreensão e revisão do conteúdo.',
        ),
      ],
    };
    expect(validateStudyState(state, originals)).toBeNull();
    const exported = await exportStudyPdf(source, state);
    const sourceInspection = await inspectPdf(source);
    const exportedInspection = await inspectPdf(exported);
    expect(exportedInspection).toHaveLength(2);
    expect(exportedInspection[0]!.text).toContain(sourceInspection[0]!.text);
    expect(exportedInspection[1]!.text).toBe(sourceInspection[1]!.text);
    expect(exportedInspection[0]!.text).toContain(
      'Atenção: explicação, compreensão e revisão do conteúdo.',
    );
    expect(exportedInspection[0]!.operators).toContain(OPS.constructPath);
    expect(exportedInspection[0]!.operators).not.toContain(
      OPS.paintImageXObject,
    );
    expect(exportedInspection[1]).toMatchObject({
      rotation: 90,
      view: [20, 30, 610, 830],
    });
    const pdf = await PDFDocument.load(exported);
    expect(pdf.getPage(1).getCropBox()).toEqual({
      x: 20,
      y: 30,
      width: 590,
      height: 800,
    });
    expect(pdf.getPage(1).getRotation().angle).toBe(90);
  });

  it('exports added explanations after their source and keeps every paragraph selectable', async () => {
    const source = await sourcePdf();
    const originals = await originalStudyPages(source);
    const answer = Array.from(
      { length: 120 },
      (_, index) => `Parágrafo ${index}: revisão e compreensão.`,
    ).join('\n');
    const applied = applyTutorPlan(
      { pages: originals, annotations: [] },
      originals[0]!.id,
      null,
      {
        answer,
        basis: 'general',
        citedBlockIds: [],
        notes: [],
        shapes: [],
        diagram: null,
        needsStudyPage: true,
        title: 'Revisão',
        sourceBlocks: [],
      },
      randomUUID(),
    );
    expect(applied.pageIds.length).toBeGreaterThan(2);
    expect(validateStudyState(applied.state, originals)).toBeNull();
    const exported = await exportStudyPdf(source, applied.state);
    const inspection = await inspectPdf(exported);
    expect(inspection).toHaveLength(originals.length + applied.pageIds.length);
    expect(inspection[0]!.text).toContain('Professor: introducao');
    expect(inspection.at(-1)!.text).toContain('Professor: pagina com rotacao');
    const combined = inspection
      .slice(1, -1)
      .map((page) => page.text)
      .join(' ');
    for (let index = 0; index < 120; index++) {
      expect(combined).toContain(`Parágrafo ${index}: revisão e compreensão.`);
    }
  });

  it('extracts authoritative source text geometry within the cropped rotated page', async () => {
    const source = await sourcePdf();
    const pages = await originalStudyPages(source);
    const blocks = await studyPageBlocks(source, pages[1]!, {
      pages,
      annotations: [],
    });
    expect(blocks.map((block) => block.text).join(' ')).toContain(
      'Professor: pagina com rotacao e recorte',
    );
    expect(blocks[0]).toMatchObject({ x: 40 });
    for (const block of blocks) {
      expect(block.x + block.width).toBeLessThanOrEqual(pages[1]!.width);
      expect(block.y + block.height).toBeLessThanOrEqual(pages[1]!.height);
      expect(block.id).toMatch(new RegExp(`^${pages[1]!.id}:`));
    }
  });

  it('returns a clear error for symbols unsupported by the export font', async () => {
    const source = await sourcePdf();
    const pages = await originalStudyPages(source);
    await expect(
      exportStudyPdf(source, {
        pages,
        annotations: [
          note(pages[0]!.id, 'Texto com símbolo não suportado: 🧑‍🚀'),
        ],
      }),
    ).rejects.toMatchObject({ code: 'PDF_FONT_GLYPH', status: 422 });
  });
  it('writes overlays in the cropped PDF coordinate space while retaining rotation', async () => {
    const source = await sourcePdf();
    const pages = await originalStudyPages(source);
    const annotations: StudyAnnotation[] = [
      note(pages[1]!.id, 'Anotação no recorte'),
    ];
    const base = { ...annotations[0]!, text: '', width: 100, height: 40 };
    annotations.push(
      { ...base, id: randomUUID(), kind: 'highlight' },
      { ...base, id: randomUUID(), kind: 'ellipse' },
      {
        ...base,
        id: randomUUID(),
        kind: 'pen',
        points: [
          { x: 80, y: 180 },
          { x: 120, y: 200 },
        ],
      },
      {
        ...base,
        id: randomUUID(),
        kind: 'arrow',
        points: [
          { x: 80, y: 180 },
          { x: 140, y: 220 },
        ],
      },
    );
    const bytes = await exportStudyPdf(source, { pages, annotations });
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(2);
      const text = await page.getTextContent();
      const annotated = text.items.find(
        (item) => 'str' in item && item.str === 'Anotação no recorte',
      );
      expect(annotated).toBeDefined();
      if (!annotated || !('transform' in annotated)) {
        throw new Error('Annotation text missing');
      }
      expect(annotated.transform[4]).toBeCloseTo(98);
      expect(annotated.transform[5]).toBeCloseTo(658);
      expect(page.rotate).toBe(90);
      expect(
        (await page.getOperatorList()).fnArray.filter(
          (operator) => operator === OPS.constructPath,
        ).length,
      ).toBeGreaterThanOrEqual(4);
    } finally {
      await task.destroy();
    }
  });
  it('exports tutor diagrams with every label and connection readable', async () => {
    const source = await sourcePdf();
    const originals = await originalStudyPages(source);
    const applied = applyTutorPlan(
      { pages: originals, annotations: [] },
      originals[0]!.id,
      null,
      {
        answer: 'A causa explica o efeito.',
        basis: 'general',
        citedBlockIds: [],
        notes: [],
        shapes: [],
        diagram: { nodes: ['Causa', 'Efeito'], edges: [{ from: 0, to: 1 }] },
        needsStudyPage: true,
        title: 'Diagrama',
        sourceBlocks: [],
      },
      randomUUID(),
    );
    const bytes = await exportStudyPdf(source, applied.state);
    const combined = (await inspectPdf(bytes))
      .map((page) => page.text)
      .join(' ');
    expect(combined).toContain('Causa');
    expect(combined).toContain('Efeito');
    expect(combined).toContain('Ligação:');
  });
  it('wraps wide W and Æ glyphs using real font widths without losing any text', async () => {
    const source = await sourcePdf();
    const pages = await originalStudyPages(source);
    const text = `${'W'.repeat(90)}\n${'Æ'.repeat(90)}\nAtenção, compreensão, revisão: á é í ó ú ç Ã Õ.`;
    const annotation = { ...note(pages[0]!.id, text), height: 420 };
    const bytes = await exportStudyPdf(source, {
      pages,
      annotations: [annotation],
    });
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    try {
      const pdf = await task.promise;
      const extracted = await (await pdf.getPage(1)).getTextContent();
      const lines = extracted.items.filter(
        (item) =>
          'str' in item &&
          Math.abs(item.transform[4] - (annotation.x + 8)) < 0.01,
      );
      const content = lines
        .flatMap((item) => ('str' in item ? [item.str] : []))
        .join('');
      expect(content.replace(/\s/gu, '')).toBe(text.replace(/\s/gu, ''));
      expect(lines.length).toBeGreaterThan(4);
      for (const line of lines) {
        if ('width' in line) {
          expect(line.width).toBeLessThanOrEqual(annotation.width - 16 + 0.05);
        }
      }
    } finally {
      await task.destroy();
    }
  });
});
