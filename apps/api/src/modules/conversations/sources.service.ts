import { Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import type { ChatOutput } from '../../infrastructure/ai/contracts.js';
import type { SourceChunk } from '../materials/retrieval.js';

export function validateChatCitations(
  output: ChatOutput,
  chunks: SourceChunk[],
): SourceChunk[] {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  for (const segment of output.segments) {
    if (
      (segment.basis === 'source' && segment.chunkIds.length === 0) ||
      (segment.basis !== 'source' && segment.chunkIds.length > 0) ||
      segment.chunkIds.some((id) => !byId.has(id))
    ) {
      throw new Error('AI_SOURCE_INVALID');
    }
  }
  if (
    output.conflicts.some(
      (conflict) =>
        new Set(conflict.chunkIds).size < 2 ||
        conflict.chunkIds.some((id) => !byId.has(id)),
    )
  ) {
    throw new Error('AI_SOURCE_INVALID');
  }
  return [
    ...new Set([
      ...output.segments.flatMap((segment) => segment.chunkIds),
      ...output.conflicts.flatMap((conflict) => conflict.chunkIds),
    ]),
  ]
    .map((id) => byId.get(id))
    .filter((chunk) => chunk !== undefined);
}

@Injectable()
export class SourcesService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);

  async select(
    ownerId: string,
    conversationId: string,
    version: number,
    materialIds: string[],
  ) {
    if (
      materialIds.length > 10 ||
      new Set(materialIds).size !== materialIds.length
    ) {
      throw new PublicError(
        422,
        'SOURCE_INVALID',
        'Selecione até dez materiais distintos.',
      );
    }
    return transaction(this.pool, async (client) => {
      const conversation = await client.query<{ version: number }>(
        'SELECT version FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',
        [ownerId, conversationId],
      );
      const current = conversation.rows[0];
      if (!current) {
        throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
      }
      if (current.version !== version) {
        throw new PublicError(
          409,
          'VERSION_CONFLICT',
          'A conversa mudou. Atualize antes de selecionar fontes.',
        );
      }
      const sources = await client.query<{ id: string }>(
        `SELECT id FROM material WHERE owner_id=$1 AND conversation_id=$2 AND id=ANY($3::uuid[])
         AND state='ready' AND deleted_at IS NULL FOR SHARE`,
        [ownerId, conversationId, materialIds],
      );
      if (sources.rows.length !== materialIds.length) {
        throw new PublicError(
          422,
          'SOURCE_UNAVAILABLE',
          'Escolha apenas materiais prontos e disponíveis.',
        );
      }
      await client.query(
        'DELETE FROM conversation_source WHERE owner_id=$1 AND conversation_id=$2',
        [ownerId, conversationId],
      );
      for (const id of materialIds) {
        await client.query(
          'INSERT INTO conversation_source(owner_id,conversation_id,material_id) VALUES ($1,$2,$3)',
          [ownerId, conversationId, id],
        );
      }
      const updated = await client.query<{ version: number }>(
        'UPDATE conversation SET version=version+1 WHERE owner_id=$1 AND id=$2 RETURNING version',
        [ownerId, conversationId],
      );
      return { materialIds, version: updated.rows[0]?.version };
    });
  }
}
