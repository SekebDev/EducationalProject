import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { validateDocxArchive } from '../src/modules/materials/docx-limits.js';
import { extractMaterial } from '../src/modules/materials/extract.js';
import { chunkSegments } from '../src/modules/materials/retrieval.js';
import { summarizeEvidence } from '../src/modules/insights/calculation.js';
import type { Evidence } from '../src/modules/insights/calculation.js';
import { safeReturnTo } from '../../web/src/lib/safe-return-to.js';

function archive(value: string, declaredSize?: number) {
  const name = Buffer.from('word/document.xml');
  const raw = Buffer.from(value);
  const compressed = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredSize ?? raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredSize ?? raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

describe('security regression boundaries', () => {
  it.each([
    '//example.invalid',
    '/\\example.invalid',
    '/\texample.invalid',
    'https://example.invalid',
  ])('rejects external or ambiguous returnTo %j', (path) => {
    expect(safeReturnTo(path, 'https://study.example.invalid')).toBe(
      '/conversas',
    );
  });
  it('keeps internal paths and query strings', () => {
    expect(
      safeReturnTo(
        '/conversas/123?tab=pdf#page',
        'https://study.example.invalid',
      ),
    ).toBe('/conversas/123?tab=pdf#page');
  });
  it('checks real DOCX expansion and rejects false ZIP size claims', () => {
    expect(() =>
      validateDocxArchive(archive('<document>ok</document>')),
    ).not.toThrow();
    expect(() =>
      validateDocxArchive(archive('x'.repeat(100_000), 1)),
    ).toThrow();
    expect(() => validateDocxArchive(archive('x'.repeat(8_000_001)))).toThrow();
  });
  it('rejects too many short lines before embeddings', async () => {
    await expect(
      extractMaterial('text/plain', Buffer.from('x\n'.repeat(10_001))),
    ).rejects.toMatchObject({ code: 'MATERIAL_SEGMENT_LIMIT' });
    expect(() =>
      chunkSegments(
        Array.from({ length: 2_001 }, (_, index) => ({
          text: 'x',
          locator: { kind: 'line' as const, number: index + 1 },
        })),
      ),
    ).toThrow('MATERIAL_CHUNK_LIMIT');
  });
  it('aggregates concentrated evidence without losing counts or provenance', () => {
    const rows: Evidence[] = Array.from({ length: 10_000 }, (_, index) => ({
      answerId: `a${index}`,
      attemptId: 'attempt',
      revisionId: `r${index}`,
      topicId: 'topic',
      level: 'easy',
      submittedAt: new Date('2026-01-01'),
      localDate: '2026-01-01',
      pointsUnits: 5_000,
      gradeState: 'graded',
    }));
    const summary = summarizeEvidence(rows);
    expect(summary.questionCount).toBe(10_000);
    expect(summary.percentage).toBe(50);
    expect(summary.topics[0]?.evidenceAnswerIds).toEqual(
      rows.map((row) => row.answerId),
    );
    expect(summary.seriesByLevel[0]?.questionCount).toBe(10_000);
  });
});
