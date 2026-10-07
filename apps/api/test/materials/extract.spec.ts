import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ExtractionError,
  extractMaterial,
} from '../../src/modules/materials/extract.js';
import { detectMaterialMime } from '../../src/modules/materials/upload.js';

const utf8 = (value: string) => new TextEncoder().encode(value);

function pdfFixture(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 44 >>\nstream\nBT /F1 12 Tf 20 200 Td (Pagina um) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`;
  return utf8(pdf);
}

describe('extração privada de material', () => {
  it.each([
    'text/markdown',
    'text/x-markdown',
    'text/plain',
    'application/octet-stream',
  ])(
    'aceita Markdown UTF-8 declarado como %s e preserva sintaxe e linhas',
    async (declaredMime) => {
      const document = utf8(
        '\uFEFF# Aula\r\n\r\n```python\r\n  print("Olá")\r\n```\r\n| A | B |',
      );
      expect(detectMaterialMime('AULA.MD', document, declaredMime)).toBe(
        'text/plain',
      );
      expect(detectMaterialMime('aula.markdown', document, declaredMime)).toBe(
        'text/plain',
      );
      await expect(extractMaterial('text/plain', document)).resolves.toEqual([
        { text: '# Aula', locator: { kind: 'line', number: 1 } },
        { text: '```python', locator: { kind: 'line', number: 3 } },
        { text: '  print("Olá")', locator: { kind: 'line', number: 4 } },
        { text: '```', locator: { kind: 'line', number: 5 } },
        { text: '| A | B |', locator: { kind: 'line', number: 6 } },
      ]);
    },
  );

  it('não aceita binários ou MIME enganoso com extensão Markdown', () => {
    for (const document of [
      utf8('%PDF-1.4'),
      Uint8Array.of(0x50, 0x4b, 0, 0),
      Uint8Array.of(0xff),
      utf8('texto\u0000binário'),
    ]) {
      expect(() =>
        detectMaterialMime('aula.md', document, 'text/markdown'),
      ).toThrow('Use um arquivo PDF');
      expect(() =>
        detectMaterialMime('aula.txt', document, 'text/plain'),
      ).toThrow('Use um arquivo PDF');
    }
    expect(() =>
      detectMaterialMime('aula.md', utf8('# Aula'), 'text/html'),
    ).toThrow('Use um arquivo PDF');
    expect(
      detectMaterialMime('aula.txt', utf8('Texto\tcom\nlinhas'), 'text/plain'),
    ).toBe('text/plain');
  });

  it('preserva números de linhas TXT e rejeita UTF-8 inválido', async () => {
    await expect(
      extractMaterial('text/plain', utf8('Primeira\n\nTerceira')),
    ).resolves.toEqual([
      { text: 'Primeira', locator: { kind: 'line', number: 1 } },
      { text: 'Terceira', locator: { kind: 'line', number: 3 } },
    ]);
    await expect(
      extractMaterial('text/plain', Uint8Array.of(0xff)),
    ).rejects.toMatchObject({
      code: 'MATERIAL_INVALID_UTF8',
    });
  });

  it('localiza texto por página PDF', async () => {
    await expect(
      extractMaterial('application/pdf', pdfFixture()),
    ).resolves.toEqual([
      { text: 'Pagina um', locator: { kind: 'page', number: 1 } },
    ]);
  });

  it('localiza texto por parágrafo DOCX', async () => {
    const fixture = await readFile(
      new URL('./fixtures/single-paragraph.docx', import.meta.url),
    );
    const segments = await extractMaterial(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fixture,
    );
    expect(segments[0]?.locator).toEqual({ kind: 'paragraph', number: 1 });
    expect(segments[0]?.text.length).toBeGreaterThan(0);
  });

  it('rejeita material vazio ou ilegível', async () => {
    await expect(
      extractMaterial('text/plain', utf8(' \n ')),
    ).rejects.toBeInstanceOf(ExtractionError);
    await expect(
      extractMaterial('application/pdf', utf8('não é PDF')),
    ).rejects.toMatchObject({
      code: 'MATERIAL_PDF_UNREADABLE',
    });
    await expect(
      extractMaterial('text/plain', new Uint8Array()),
    ).rejects.toMatchObject({
      code: 'MATERIAL_SIZE_INVALID',
    });
  });
});
