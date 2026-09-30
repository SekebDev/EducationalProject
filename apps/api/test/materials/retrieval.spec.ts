import { describe, expect, it } from 'vitest';
import {
  chunkSegments,
  vectorLiteral,
} from '../../src/modules/materials/retrieval.js';

describe('preparo de trechos e embeddings', () => {
  it('preserva localizador e limita o tamanho de cada trecho', () => {
    const chunks = chunkSegments([
      { text: 'termo '.repeat(300), locator: { kind: 'page', number: 3 } },
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1_200)).toBe(true);
    expect(
      chunks.every(
        (chunk) => chunk.locator.kind === 'page' && chunk.locator.number === 3,
      ),
    ).toBe(true);
  });

  it('rejeita vetor de dimensão ou valor incorreto', () => {
    expect(() => vectorLiteral([0])).toThrow('EMBEDDING_INVALID');
    expect(() =>
      vectorLiteral(Array.from({ length: 1_536 }, () => Number.NaN)),
    ).toThrow('EMBEDDING_INVALID');
    expect(vectorLiteral(Array.from({ length: 1_536 }, () => 0))).toMatch(
      /^\[0,0/u,
    );
  });
});
