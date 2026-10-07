import { describe, expect, it } from 'vitest';
import {
  chunkSegments,
  vectorLiteral,
} from '../../src/modules/materials/retrieval.js';

describe('preparo de trechos e embeddings', () => {
  it('preserva indentação Markdown e conteúdo em limites de trechos', () => {
    const text = `  const valor = "espaços  duplos";\t${'termo '.repeat(300)}fim`;
    const chunks = chunkSegments([
      { text, locator: { kind: 'line', number: 4 } },
    ]);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
    expect(chunks[0]?.text).toContain('  const valor = "espaços  duplos";\t');
    expect(chunks.every((chunk) => chunk.text.length <= 1_200)).toBe(true);
    expect(chunks.every((chunk) => chunk.locator.number === 4)).toBe(true);
    const longWord = 'x'.repeat(2_401);
    expect(
      chunkSegments([{ text: longWord, locator: { kind: 'line', number: 8 } }])
        .map((chunk) => chunk.text)
        .join(''),
    ).toBe(longWord);
  });

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
