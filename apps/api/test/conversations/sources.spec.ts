import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateChatCitations } from '../../src/modules/conversations/sources.service.js';

const chunk = {
  id: randomUUID(),
  materialId: randomUUID(),
  name: 'Aula.txt',
  text: 'A célula produz energia.',
  locator: { kind: 'line' as const, number: 1 },
};

describe('citações do chat', () => {
  it('aceita apenas trechos recuperados e citados em segmento de fonte', () => {
    expect(
      validateChatCitations(
        {
          segments: [
            {
              text: 'A célula produz energia.',
              basis: 'source',
              chunkIds: [chunk.id],
            },
          ],
          conflicts: [],
        },
        [chunk],
      ),
    ).toEqual([chunk]);
    expect(() =>
      validateChatCitations(
        {
          segments: [
            {
              text: 'Afirmação inventada',
              basis: 'source',
              chunkIds: [randomUUID()],
            },
          ],
          conflicts: [],
        },
        [chunk],
      ),
    ).toThrow('AI_SOURCE_INVALID');
  });

  it('rejeita citação omitida, conhecimento geral com citação e conflito inventado', () => {
    expect(() =>
      validateChatCitations(
        {
          segments: [
            { text: 'Afirmo com base em fonte', basis: 'source', chunkIds: [] },
          ],
          conflicts: [],
        },
        [chunk],
      ),
    ).toThrow('AI_SOURCE_INVALID');
    expect(() =>
      validateChatCitations(
        {
          segments: [
            {
              text: 'Conhecimento geral',
              basis: 'general',
              chunkIds: [chunk.id],
            },
          ],
          conflicts: [],
        },
        [chunk],
      ),
    ).toThrow('AI_SOURCE_INVALID');
    expect(() =>
      validateChatCitations(
        {
          segments: [
            { text: 'Há divergência', basis: 'unsupported', chunkIds: [] },
          ],
          conflicts: [{ description: 'Contradição', chunkIds: [randomUUID()] }],
        },
        [chunk],
      ),
    ).toThrow('AI_SOURCE_INVALID');
  });

  it('preserva as duas fontes de uma contradição verificável', () => {
    const other = {
      ...chunk,
      id: randomUUID(),
      text: 'A célula não produz energia.',
    };
    expect(
      validateChatCitations(
        {
          segments: [
            { text: 'As fontes divergem.', basis: 'unsupported', chunkIds: [] },
          ],
          conflicts: [
            {
              description: 'Afirmações opostas',
              chunkIds: [chunk.id, other.id],
            },
          ],
        },
        [chunk, other],
      ),
    ).toEqual([chunk, other]);
  });
});
