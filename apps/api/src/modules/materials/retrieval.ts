import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import { createPool } from '../../infrastructure/db/pool.js';
import type { ExtractedSegment } from './extract.js';
import { ExtractionError } from './extract.js';

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
    let start = 0;
    while (start < segment.text.length) {
      let end = Math.min(start + 1_200, segment.text.length);
      if (end < segment.text.length) {
        for (let boundary = end - 1; boundary > start; boundary--) {
          if (/\s/u.test(segment.text[boundary] ?? '')) {
            end = boundary + 1;
            break;
          }
        }
      }
      chunks.push({
        text: segment.text.slice(start, end),
        locator: segment.locator,
      });
      if (chunks.length > 2_000) {
        throw new ExtractionError('MATERIAL_CHUNK_LIMIT');
      }
      start = end;
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
  signal?: AbortSignal,
): Promise<SourceChunk[]> {
  signal?.throwIfAborted();
  if (selected.length === 0) {
    return [];
  }
  const provider = createAiProvider(readConfig(process.env));
  const embedding = (await provider.embed([question], signal))[0];
  signal?.throwIfAborted();
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
