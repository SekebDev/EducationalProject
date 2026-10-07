import pg from 'pg';
import type { EducationalSkill, ResponseDepth } from '@study/contracts';
import { readConfig } from '../../infrastructure/config.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import type { JobHandler } from '../../infrastructure/jobs/dispatcher.js';
import { personalityStyleAtVersion } from './personalities.js';
import type { PersonalityKey } from './personalities.js';
import { educationalSkillAtVersion } from './educational-skills.js';
import { retrieveChunks } from '../materials/retrieval.js';
import { validateChatCitations } from './sources.service.js';
import {
  enforceStudyChatOutput,
  studyRequestRedirect,
} from '../../infrastructure/ai/study-chat-policy.js';

type ChatRow = {
  id: string;
  conversation_id: string;
  turn_id: string;
  personality_snapshot: PersonalityKey;
  personality_version_snapshot: number;
  skill_snapshot: EducationalSkill;
  skill_version_snapshot: number;
  response_depth_snapshot: ResponseDepth;
  question: string;
  source_snapshot: Array<{ id: string; version: number }>;
};

export function filterActiveHistory(
  rows: Array<{
    content: string;
    source_snapshot: Array<{ id: string; version: number }>;
  }>,
  activeVersions: Map<string, number>,
): string[] {
  return rows
    .filter((row) =>
      row.source_snapshot.every(
        (source) => activeVersions.get(source.id) === source.version,
      ),
    )
    .map((row) => row.content);
}

export function createChatJobHandler(databaseUrl: string): JobHandler {
  const pool = createPool(databaseUrl);
  const config = readConfig(process.env);
  const provider = createAiProvider(config);
  const model =
    config.aiProvider === 'openai'
      ? (process.env.OPENAI_CHAT_MODEL ?? 'gpt-6-luna')
      : 'fake';
  const generate = async (
    lease: Parameters<JobHandler>[0],
    connection: pg.PoolClient,
  ) => {
    const loaded = await connection.query<ChatRow>(
      `SELECT assistant.id,assistant.conversation_id,assistant.turn_id,assistant.personality_snapshot,assistant.personality_version_snapshot,assistant.skill_snapshot,assistant.skill_version_snapshot,assistant.response_depth_snapshot,assistant.source_snapshot,
         question.content AS question FROM message assistant
         JOIN conversation c ON c.id=assistant.conversation_id AND c.owner_id=assistant.owner_id
         JOIN message question ON question.turn_id=assistant.turn_id AND question.role='user'
         WHERE assistant.owner_id=$1 AND assistant.id=$2 AND assistant.role='assistant' AND c.deleted_at IS NULL`,
      [lease.ownerId, lease.resourceId],
    );
    const message = loaded.rows[0];
    if (!message) {
      throw new Error('CHAT_RESOURCE_UNAVAILABLE');
    }
    // Resolve the saved catalog version, including during retries; conversation edits cannot change this turn.
    educationalSkillAtVersion(
      message.skill_snapshot,
      message.skill_version_snapshot,
    );
    await connection.query(
      "UPDATE message SET state='generating' WHERE owner_id=$1 AND id=$2 AND state IN ('queued','failed')",
      [lease.ownerId, lease.resourceId],
    );
    const history = await connection.query<{
      content: string;
      source_snapshot: Array<{ id: string; version: number }>;
    }>(
      `SELECT content,source_snapshot FROM message WHERE owner_id=$1 AND conversation_id=$2 AND state='completed'
         AND sequence<(SELECT sequence FROM message WHERE id=$3) ORDER BY sequence DESC LIMIT 20`,
      [lease.ownerId, message.conversation_id, lease.resourceId],
    );
    const historySourceIds = [
      ...new Set(
        history.rows.flatMap((row) =>
          row.source_snapshot.map((source) => source.id),
        ),
      ),
    ];
    const availableSources = historySourceIds.length
      ? await connection.query<{ id: string; version: number }>(
          "SELECT id,version FROM material WHERE owner_id=$1 AND conversation_id=$2 AND id=ANY($3::uuid[]) AND deleted_at IS NULL AND (state='ready' OR detected_mime='application/pdf')",
          [lease.ownerId, message.conversation_id, historySourceIds],
        )
      : { rows: [] };
    const activeVersions = new Map(
      availableSources.rows.map((row) => [row.id, row.version]),
    );
    const redirect = studyRequestRedirect(message.question);
    const chunks = redirect
      ? []
      : await retrieveChunks(
          lease.ownerId,
          message.conversation_id,
          message.source_snapshot,
          message.question,
        );
    const response =
      redirect ??
      enforceStudyChatOutput(
        await provider.chat({
          question: message.question,
          skill: message.skill_snapshot,
          skillVersion: message.skill_version_snapshot,
          responseDepth: message.response_depth_snapshot,
          personality: personalityStyleAtVersion(
            message.personality_snapshot,
            message.personality_version_snapshot,
          ),
          history: filterActiveHistory(history.rows.reverse(), activeVersions),
          sources: chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
        }),
      );
    const cited = validateChatCitations(response, chunks);
    const content = [
      ...response.segments.map((segment) => segment.text),
      ...response.conflicts.map(
        (conflict) => `Fontes em conflito: ${conflict.description}`,
      ),
    ]
      .join('\n\n')
      .trim();
    if (!content) {
      throw new Error('AI_OUTPUT_EMPTY');
    }
    return {
      apply: async (client: pg.PoolClient) => {
        const selected = await client.query<{ id: string }>(
          `SELECT m.id FROM material m JOIN jsonb_to_recordset($3::jsonb) AS snapshot(id uuid,version int)
           ON snapshot.id=m.id AND snapshot.version=m.version
           WHERE m.owner_id=$1 AND m.conversation_id=$2 AND m.state='ready' AND m.deleted_at IS NULL
           FOR SHARE OF m`,
          [
            lease.ownerId,
            message.conversation_id,
            JSON.stringify(message.source_snapshot),
          ],
        );
        const active = await client.query<{ id: string }>(
          `SELECT chunk.id FROM material_chunk chunk JOIN material m ON m.id=chunk.material_id AND m.owner_id=chunk.owner_id
           WHERE chunk.owner_id=$1 AND chunk.id=ANY($2::uuid[]) AND m.deleted_at IS NULL AND m.state='ready'
             AND chunk.extraction_version=m.version-1 FOR SHARE OF m`,
          [lease.ownerId, cited.map((chunk) => chunk.id)],
        );
        const citationsValid =
          selected.rows.length === message.source_snapshot.length &&
          active.rows.length === cited.length;
        const safeContent = citationsValid
          ? content
          : 'Uma fonte foi removida enquanto eu preparava a resposta. Faça a pergunta novamente com as fontes disponíveis.';
        const references = citationsValid
          ? cited.map((chunk) => ({
              materialId: chunk.materialId,
              chunkId: chunk.id,
              name: chunk.name,
              locator: chunk.locator,
              available: true,
            }))
          : [];
        const updated = await client.query(
          `UPDATE message m SET content=$3,state='completed',references_json=$6::jsonb,model=$4,prompt_version=$5
             FROM conversation c WHERE m.owner_id=$1 AND m.id=$2 AND c.owner_id=m.owner_id
             AND c.id=m.conversation_id AND c.deleted_at IS NULL AND m.state IN ('generating','queued','failed') RETURNING m.id`,
          [
            lease.ownerId,
            lease.resourceId,
            safeContent,
            model,
            `chat-v3-personality-${message.personality_version_snapshot}-skill-${message.skill_version_snapshot}-${message.skill_snapshot}-depth-${message.response_depth_snapshot}`,
            JSON.stringify(references),
          ],
        );
        if (!updated.rowCount) {
          throw new Error('CHAT_RESOURCE_UNAVAILABLE');
        }
      },
    };
  };
  return async (lease) => {
    const connection = await pool.connect();
    let key: string | null = null;
    let releaseError: Error | undefined;
    try {
      const message = await connection.query<{ conversation_id: string }>(
        'SELECT conversation_id FROM message WHERE owner_id=$1 AND id=$2',
        [lease.ownerId, lease.resourceId],
      );
      if (!message.rows[0]) {
        throw new Error('CHAT_RESOURCE_UNAVAILABLE');
      }
      const candidate = `conversation-turn:${lease.ownerId}:${message.rows[0].conversation_id}`;
      const lock = await connection.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
        [candidate],
      );
      if (!lock.rows[0]!.locked) {
        throw new PublicError(
          409,
          'TURN_IN_PROGRESS',
          'A explicação desta conversa ainda está em andamento.',
          true,
        );
      }
      key = candidate;
      return await generate(lease, connection);
    } finally {
      try {
        if (key) {
          await connection.query(
            'SELECT pg_advisory_unlock(hashtextextended($1,0))',
            [key],
          );
        }
      } catch (error) {
        releaseError =
          error instanceof Error
            ? error
            : new Error('CONVERSATION_LOCK_RELEASE_FAILED');
      } finally {
        connection.release(releaseError);
      }
    }
  };
}
