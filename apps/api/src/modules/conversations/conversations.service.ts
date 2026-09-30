import type {
  CreateConversationDto,
  UpdateConversationDto,
  SendMessageDto,
} from './dto/conversations.dto.js';
import type {
  ConversationEntity,
  MessageEntity,
} from './entities/conversations.entity.js';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { recordDeletion } from '../../infrastructure/deletion/deletion-record.js';
import { withIdempotency } from '../../infrastructure/http/idempotency.js';
import { OperationRepository } from '../../infrastructure/jobs/operations.js';
import { PERSONALITY_CATALOG_VERSION } from './personalities.js';
import type { PersonalityKey } from './personalities.js';

@Injectable()
export class ConversationsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  async create(ownerId: string, key: string, input: CreateConversationDto) {
    const result = await withIdempotency(
      this.pool,
      { ownerId, route: 'POST /conversations', key, body: input },
      async (client) => {
        const created = await client.query<{ id: string }>(
          'INSERT INTO conversation(owner_id,title,personality_key) VALUES ($1,$2,$3) RETURNING id',
          [ownerId, input.title?.trim() || 'Nova conversa', input.personality],
        );
        const id = created.rows[0]?.id;
        if (!id) {
          throw new Error('Conversa não criada');
        }
        return { resourceId: id, status: 201 };
      },
      async (client, id) =>
        (
          await client.query(
            'SELECT 1 FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
            [ownerId, id],
          )
        ).rowCount !== 0,
    );
    return this.get(ownerId, result.resourceId);
  }

  async get(ownerId: string, id: string) {
    const result = await this.pool.query<ConversationEntity>(
      'SELECT id,title,personality_key,version,created_at FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
      [ownerId, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
    }
    return {
      id: row.id,
      title: row.title,
      personality: row.personality_key,
      version: row.version,
      createdAt: row.created_at,
    };
  }

  async list(ownerId: string, cursor?: string) {
    let beforeDate: string | null = null;
    let beforeId: string | null = null;
    if (cursor) {
      try {
        const parsed = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as { date: string; id: string };
        if (
          Number.isNaN(Date.parse(parsed.date)) ||
          !/^[0-9a-f-]{36}$/i.test(parsed.id)
        ) {
          throw new Error('Invalid');
        }
        beforeDate = parsed.date;
        beforeId = parsed.id;
      } catch {
        throw new PublicError(400, 'CURSOR_INVALID', 'Página inválida.');
      }
    }
    const result = await this.pool.query<ConversationEntity>(
      `SELECT id,title,personality_key,version,created_at FROM conversation
       WHERE owner_id=$1 AND deleted_at IS NULL AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
       ORDER BY created_at DESC,id DESC LIMIT 21`,
      [ownerId, beforeDate, beforeId],
    );
    const rows = result.rows.slice(0, 20);
    const last = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        personality: row.personality_key,
        version: row.version,
        createdAt: row.created_at,
      })),
      nextCursor:
        result.rows.length > 20 && last
          ? Buffer.from(
              JSON.stringify({
                date: last.created_at.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }

  async update(ownerId: string, id: string, input: UpdateConversationDto) {
    const result = await this.pool.query(
      `UPDATE conversation SET title=COALESCE($4,title),personality_key=COALESCE($5,personality_key),version=version+1
       WHERE owner_id=$1 AND id=$2 AND version=$3 AND deleted_at IS NULL RETURNING id`,
      [
        ownerId,
        id,
        input.version,
        input.title?.trim() ?? null,
        input.personality ?? null,
      ],
    );
    if (result.rowCount === 0) {
      await this.get(ownerId, id);
      throw new PublicError(
        409,
        'VERSION_CONFLICT',
        'A conversa mudou. Atualize antes de salvar.',
      );
    }
    return this.get(ownerId, id);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deleted = await client.query(
        'UPDATE conversation SET deleted_at=now(),version=version+1 WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',
        [ownerId, id],
      );
      if (deleted.rowCount === 0) {
        throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
      }
      await recordDeletion(client, ownerId, 'conversation', id);
      const materials = await client.query<{ id: string }>(
        'UPDATE material SET deleted_at=now(),version=version+1 WHERE owner_id=$1 AND conversation_id=$2 AND deleted_at IS NULL RETURNING id',
        [ownerId, id],
      );
      for (const material of materials.rows) {
        await recordDeletion(client, ownerId, 'material', material.id);
      }
      await client.query(
        `UPDATE operation SET state='cancelled',phase='cancelled',fence_version=fence_version+1,
         lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND kind='generate-exam'
         AND state IN ('pending','running') AND resource_id IN
         (SELECT id FROM exam WHERE owner_id=$1 AND conversation_id=$2 AND state IN ('queued','generating'))`,
        [ownerId, id],
      );
      await client.query(
        `UPDATE exam SET state='failed',context_snapshot=NULL
         WHERE owner_id=$1 AND conversation_id=$2 AND state IN ('queued','generating')`,
        [ownerId, id],
      );
      await client.query(
        `UPDATE operation SET state='cancelled',fence_version=fence_version+1,lease_until=NULL,updated_at=now()
         WHERE owner_id=$1 AND state IN ('pending','running') AND resource_id IN
         (SELECT id FROM message WHERE owner_id=$1 AND conversation_id=$2)`,
        [ownerId, id],
      );
    });
  }

  async messages(ownerId: string, conversationId: string, after = 0) {
    await this.get(ownerId, conversationId);
    const result = await this.pool.query<MessageEntity>(
      `SELECT m.id,m.sequence,m.role,m.content,m.state,m.personality_snapshot,m.references_json,o.id AS operation_id FROM message m
       LEFT JOIN operation o ON o.resource_id=m.id AND o.kind='answer-chat' AND o.owner_id=m.owner_id
       WHERE m.owner_id=$1 AND m.conversation_id=$2 AND m.sequence>$3 ORDER BY m.sequence LIMIT 101`,
      [ownerId, conversationId, after],
    );
    const rows = result.rows.slice(0, 100);
    const referenceIds = [
      ...new Set(
        rows.flatMap((row) =>
          Array.isArray(row.references_json)
            ? row.references_json
                .map(
                  (reference: { materialId?: string }) => reference.materialId,
                )
                .filter((id): id is string => typeof id === 'string')
            : [],
        ),
      ),
    ];
    const available = referenceIds.length
      ? await this.pool.query<{ id: string }>(
          "SELECT id FROM material WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND state='ready' AND deleted_at IS NULL",
          [ownerId, referenceIds],
        )
      : { rows: [] };
    const activeIds = new Set(available.rows.map((row) => row.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        role: row.role,
        content: row.content,
        state: row.state,
        personality: row.personality_snapshot,
        references: Array.isArray(row.references_json)
          ? row.references_json.map(
              (reference: {
                materialId: string;
                chunkId: string;
                name: string;
                locator: unknown;
              }) => ({
                ...reference,
                available: activeIds.has(reference.materialId),
              }),
            )
          : [],
        aiGenerated: row.role === 'assistant',
        operationId: row.operation_id,
      })),
      nextCursor:
        result.rows.length > 100 ? String(rows.at(-1)?.sequence) : null,
    };
  }

  async sendMessage(
    ownerId: string,
    conversationId: string,
    key: string,
    input: SendMessageDto,
  ) {
    const result = await withIdempotency(
      this.pool,
      {
        ownerId,
        route: `POST /conversations/${conversationId}/messages`,
        key,
        body: input,
      },
      async (client) => {
        const conversation = await client.query<{
          version: number;
          personality_key: PersonalityKey;
        }>(
          'SELECT version,personality_key FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',
          [ownerId, conversationId],
        );
        const current = conversation.rows[0];
        if (!current) {
          throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
        }
        if (current.version !== input.conversationVersion) {
          throw new PublicError(
            409,
            'VERSION_CONFLICT',
            'A conversa mudou. Atualize antes de enviar.',
          );
        }
        const active = await client.query(
          "SELECT 1 FROM message WHERE owner_id=$1 AND conversation_id=$2 AND role='assistant' AND state IN ('queued','generating') LIMIT 1",
          [ownerId, conversationId],
        );
        if (active.rowCount) {
          throw new PublicError(
            409,
            'TURN_IN_PROGRESS',
            'A resposta anterior ainda está em andamento.',
          );
        }
        const next = await client.query<{ sequence: number }>(
          'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM message WHERE conversation_id=$1',
          [conversationId],
        );
        const sequence = Number(next.rows[0]?.sequence);
        const selected = await client.query<{ id: string; version: number }>(
          `SELECT m.id,m.version FROM conversation_source s JOIN material m
           ON m.owner_id=s.owner_id AND m.id=s.material_id AND m.conversation_id=s.conversation_id
           WHERE s.owner_id=$1 AND s.conversation_id=$2 AND m.state='ready' AND m.deleted_at IS NULL
           ORDER BY m.id FOR SHARE OF m`,
          [ownerId, conversationId],
        );
        const sourceSnapshot = JSON.stringify(selected.rows);
        const turnId = randomUUID();
        await client.query(
          `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot,personality_version_snapshot,source_snapshot)
          VALUES ($1,$2,$3,'user',$4,'completed',$5,$6,$7,$8::jsonb)`,
          [
            ownerId,
            conversationId,
            sequence,
            input.content.trim(),
            turnId,
            current.personality_key,
            PERSONALITY_CATALOG_VERSION,
            sourceSnapshot,
          ],
        );
        const assistant = await client.query<{ id: string }>(
          `INSERT INTO message(owner_id,conversation_id,sequence,role,state,turn_id,personality_snapshot,personality_version_snapshot,source_snapshot)
          VALUES ($1,$2,$3,'assistant','queued',$4,$5,$6,$7::jsonb) RETURNING id`,
          [
            ownerId,
            conversationId,
            sequence + 1,
            turnId,
            current.personality_key,
            PERSONALITY_CATALOG_VERSION,
            sourceSnapshot,
          ],
        );
        const assistantId = assistant.rows[0]?.id;
        if (!assistantId) {
          throw new Error('Resposta não criada');
        }
        await this.operations.create(client, {
          ownerId,
          resourceId: assistantId,
          kind: 'answer-chat',
          dedupeKey: key,
          inputVersion: current.version,
        });
        await client.query(
          'UPDATE conversation SET version=version+1 WHERE owner_id=$1 AND id=$2',
          [ownerId, conversationId],
        );
        return { resourceId: assistantId, status: 202 };
      },
      async (client, id) =>
        (
          await client.query(
            `SELECT 1 FROM message m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
        WHERE m.owner_id=$1 AND m.id=$2 AND c.deleted_at IS NULL`,
            [ownerId, id],
          )
        ).rowCount !== 0,
    );
    const operation = await this.pool.query<{
      id: string;
      user_id: string;
      sequence: number;
      content: string;
      personality_snapshot: PersonalityKey;
    }>(
      `SELECT o.id,m.id AS user_id,m.sequence,m.content,m.personality_snapshot
       FROM operation o JOIN message assistant ON assistant.id=o.resource_id
       JOIN message m ON m.conversation_id=assistant.conversation_id AND m.turn_id=assistant.turn_id AND m.role='user'
       WHERE o.owner_id=$1 AND o.kind=$2 AND o.resource_id=$3`,
      [ownerId, 'answer-chat', result.resourceId],
    );
    const row = operation.rows[0];
    if (!row) {
      throw new Error('Operação de resposta não encontrada');
    }
    return {
      userMessage: {
        id: row.user_id,
        sequence: row.sequence,
        role: 'user' as const,
        content: row.content,
        state: 'completed' as const,
        personality: row.personality_snapshot,
        references: [],
        aiGenerated: false,
      },
      assistantMessageId: result.resourceId,
      operationId: row.id,
    };
  }
}
