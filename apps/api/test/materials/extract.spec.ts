import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ExtractionError,
  extractMaterial,
} from '../../src/modules/materials/extract.js';

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
