import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import { createPool } from '../../infrastructure/db/pool.js';
import type { ExtractedSegment } from './extract.js';

export type SourceChunk = {
  id: string;
  materialId: string;
  name: string;
  text: string;
  locator: ExtractedSegment['locator'];
};

export function chunkSegments(
  segments: ExtractedSegment[],
): ExtractedSegment[] {
  const chunks: ExtractedSegment[] = [];
  for (const segment of segments) {
    const words = segment.text.split(/\s+/u);
    let current = '';
    for (const word of words) {
      if (current && current.length + word.length + 1 > 1_200) {
        chunks.push({ text: current, locator: segment.locator });
        current = '';
      }
      if (word.length > 1_200) {
        if (current) {
          chunks.push({ text: current, locator: segment.locator });
        }
        for (let start = 0; start < word.length; start += 1_200) {
          chunks.push({
            text: word.slice(start, start + 1_200),
            locator: segment.locator,
          });
        }
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) {
      chunks.push({ text: current, locator: segment.locator });
    }
  }
  return chunks;
}

export function vectorLiteral(vector: number[]): string {
  if (
    vector.length !== 1_536 ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('EMBEDDING_INVALID');
  }
  return `[${vector.join(',')}]`;
}

export async function retrieveChunks(
  ownerId: string,
  conversationId: string,
  selected: Array<{ id: string; version: number }>,
  question: string,
  limit = 8,
): Promise<SourceChunk[]> {
  if (selected.length === 0) {
    return [];
  }
  const provider = createAiProvider(readConfig(process.env));
  const embedding = (await provider.embed([question]))[0];
  if (!embedding) {
    throw new Error('EMBEDDING_INVALID');
  }
  const pool = createPool(readConfig(process.env).databaseUrl);
  try {
    const result = await pool.query<{
      id: string;
      material_id: string;
      original_name: string;
      text: string;
      locator: ExtractedSegment['locator'];
    }>(
      `SELECT chunk.id,chunk.material_id,m.original_name,chunk.text,chunk.locator
       FROM material_chunk chunk JOIN material m ON m.id=chunk.material_id AND m.owner_id=chunk.owner_id
       JOIN unnest($3::uuid[],$4::int[]) selected(id,version) ON selected.id=m.id AND selected.version=m.version
       WHERE chunk.owner_id=$1 AND m.conversation_id=$2
         AND m.state='ready' AND m.deleted_at IS NULL AND chunk.extraction_version=m.version-1
         AND chunk.embedding IS NOT NULL
       ORDER BY chunk.embedding <=> $5::vector LIMIT $6`,
      [
        ownerId,
        conversationId,
        selected.map((source) => source.id),
        selected.map((source) => source.version),
        vectorLiteral(embedding),
        limit,
      ],
    );
    return result.rows.map((row) => ({
      id: row.id,
      materialId: row.material_id,
      name: row.original_name,
      text: row.text,
      locator: row.locator,
    }));
  } finally {
    await pool.end();
  }
}
