import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  EducationalSkill,
  ResponseDepth,
  StudyPage,
} from '@study/contracts';
import { PublicError } from '../../infrastructure/http/public-error.js';
import {
  PERSONALITY_CATALOG_VERSION,
  personalityStyleAtVersion,
} from '../conversations/personalities.js';
import type { PersonalityKey } from '../conversations/personalities.js';
import { EDUCATIONAL_SKILL_VERSION } from '../conversations/educational-skills.js';
import type { SourceChunk } from '../materials/retrieval.js';
import type { TutorPlan } from './tutor.js';

type SourceVersion = { id: string; version: number };
export type PdfConversationContext = {
  version: number;
  personality_key: PersonalityKey;
  skill_key: EducationalSkill;
  response_depth: ResponseDepth;
  sequence: number;
  sources: SourceVersion[];
  materialVersion: number;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

/** Only server-owned conversation data becomes the tutor's context. */
export async function readPdfConversationContext(
  client: pg.PoolClient,
  ownerId: string,
  conversationId: string,
  materialId: string,
  lock = false,
): Promise<PdfConversationContext> {
  if (lock) {
    await client.query(
      'SELECT id FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',
      [ownerId, conversationId],
    );
  }
  const found = await client.query<
    Omit<PdfConversationContext, 'sources' | 'history'>
  >(
    `SELECT c.version,c.personality_key,c.skill_key,c.response_depth,m.version AS "materialVersion",
      COALESCE((SELECT max(sequence) FROM message WHERE owner_id=c.owner_id AND conversation_id=c.id),0) AS sequence
     FROM conversation c JOIN material m ON m.owner_id=c.owner_id AND m.conversation_id=c.id
     WHERE c.owner_id=$1 AND c.id=$2 AND m.id=$3 AND c.deleted_at IS NULL AND m.deleted_at IS NULL
     ${lock ? 'FOR SHARE OF m' : ''}`,
    [ownerId, conversationId, materialId],
  );
  const current = found.rows[0];
  if (!current) {
    throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
  }
  const active = await client.query(
    `SELECT 1 FROM message m WHERE m.owner_id=$1 AND m.conversation_id=$2 AND m.role='assistant'
     AND (m.state IN ('queued','generating') OR EXISTS
       (SELECT 1 FROM operation o WHERE o.owner_id=m.owner_id AND o.resource_id=m.id
        AND o.kind='answer-chat' AND o.state IN ('pending','running'))) LIMIT 1`,
    [ownerId, conversationId],
  );
  if (active.rowCount) {
    throw new PublicError(
      409,
      'TURN_IN_PROGRESS',
      'A resposta desta conversa ainda está em andamento.',
    );
  }
  const sources = await client.query<SourceVersion>(
    `SELECT m.id,m.version FROM conversation_source s JOIN material m
     ON m.owner_id=s.owner_id AND m.id=s.material_id AND m.conversation_id=s.conversation_id
     WHERE s.owner_id=$1 AND s.conversation_id=$2 AND m.state='ready' AND m.deleted_at IS NULL
     ORDER BY m.id ${lock ? 'FOR SHARE OF m' : ''}`,
    [ownerId, conversationId],
  );
  const history = await client.query<{
    role: 'user' | 'assistant';
    content: string;
    source_snapshot: SourceVersion[];
  }>(
    `SELECT role,content,source_snapshot FROM message WHERE owner_id=$1 AND conversation_id=$2
     AND state='completed' ORDER BY sequence DESC LIMIT 20`,
    [ownerId, conversationId],
  );
  const sourceIds = [
    ...new Set(
      history.rows.flatMap((row) =>
        row.source_snapshot.map((source) => source.id),
      ),
    ),
  ];
  const available = sourceIds.length
    ? await client.query<SourceVersion>(
        `SELECT id,version FROM material WHERE owner_id=$1 AND conversation_id=$2
     AND id=ANY($3::uuid[]) AND (state='ready' OR detected_mime='application/pdf') AND deleted_at IS NULL`,
        [ownerId, conversationId, sourceIds],
      )
    : { rows: [] };
  const activeVersions = new Map(
    available.rows.map((source) => [source.id, source.version]),
  );
  return {
    ...current,
    sources: sources.rows,
    history: history.rows
      .reverse()
      .filter((row) =>
        row.source_snapshot.every(
          (source) => activeVersions.get(source.id) === source.version,
        ),
      )
      .map(({ role, content }) => ({ role, content })),
  };
}

export function pdfConversationTeaching(context: PdfConversationContext) {
  return {
    personality: personalityStyleAtVersion(
      context.personality_key,
      PERSONALITY_CATALOG_VERSION,
    ),
    skill: context.skill_key,
    skillVersion: EDUCATIONAL_SKILL_VERSION,
    responseDepth: context.response_depth,
  };
}

export function assertPdfContextUnchanged(
  before: PdfConversationContext,
  after: PdfConversationContext,
) {
  if (
    before.version !== after.version ||
    before.sequence !== after.sequence ||
    before.materialVersion !== after.materialVersion ||
    JSON.stringify(before.sources) !== JSON.stringify(after.sources) ||
    JSON.stringify(before.history) !== JSON.stringify(after.history)
  ) {
    throw new PublicError(
      409,
      'CONVERSATION_CONTEXT_CHANGED',
      'A conversa ou suas fontes mudaram durante a explicação. Atualize a conversa e envie a pergunta novamente.',
    );
  }
}

export async function pdfPageReferenceChunks(
  client: pg.PoolClient,
  ownerId: string,
  materialId: string,
  sourcePageIndex: number | null,
): Promise<SourceChunk[]> {
  if (sourcePageIndex === null) {
    return [];
  }
  const result = await client.query<SourceChunk>(
    `SELECT chunk.id,chunk.material_id AS "materialId",m.original_name AS name,chunk.text,chunk.locator
     FROM material_chunk chunk JOIN material m ON m.owner_id=chunk.owner_id AND m.id=chunk.material_id
     WHERE chunk.owner_id=$1 AND chunk.material_id=$2 AND m.deleted_at IS NULL AND m.state='ready'
       AND chunk.extraction_version=m.version-1 AND chunk.locator->>'kind'='page'
       AND chunk.locator->>'number'=$3 ORDER BY chunk.id LIMIT 100`,
    [ownerId, materialId, String(sourcePageIndex + 1)],
  );
  return result.rows;
}

export async function savePdfConversationTurn(
  client: pg.PoolClient,
  input: {
    ownerId: string;
    conversationId: string;
    materialId: string;
    page: StudyPage;
    explanationId: string;
    question: string;
    context: PdfConversationContext;
    plan: TutorPlan;
    sources: SourceChunk[];
    pageChunks: SourceChunk[];
    model: string;
  },
) {
  const { context, plan } = input;
  const cited = input.sources.filter((source) =>
    plan.citedBlockIds.includes(source.id),
  );
  const pageCited = plan.citedBlockIds.some((id) =>
    plan.sourceBlocks.some((block) => block.id === id),
  );
  // Never substitute an unrelated chunk for a page citation. pdfContext still opens
  // the verified page when no indexed segment matches (including scanned PDFs).
  const normalize = (text: string) =>
    text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
  for (const block of plan.sourceBlocks.filter((candidate) =>
    plan.citedBlockIds.includes(candidate.id),
  )) {
    const text = normalize(block.text);
    if (text.length < 20 || block.id.endsWith(':visual')) {
      continue;
    }
    const matching = input.pageChunks.find((chunk) =>
      normalize(chunk.text).includes(text),
    );
    if (matching) {
      cited.push(matching);
    }
  }
  const references = [
    ...new Map(cited.map((chunk) => [chunk.id, chunk])).values(),
  ].map((chunk) => ({
    materialId: chunk.materialId,
    chunkId: chunk.id,
    name: chunk.name,
    locator: chunk.locator,
    available: true,
  }));
  const snapshots = [
    ...new Map(
      [
        ...context.sources,
        { id: input.materialId, version: context.materialVersion },
      ].map((source) => [source.id, source]),
    ).values(),
  ];
  const turnId = randomUUID();
  for (const [index, role] of (['user', 'assistant'] as const).entries()) {
    const id = randomUUID();
    const content = role === 'user' ? input.question : plan.answer;
    await client.query(
      `INSERT INTO message(id,owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot,
       personality_version_snapshot,source_snapshot,skill_snapshot,skill_version_snapshot,response_depth_snapshot,
       references_json,model,prompt_version,pdf_material_id,pdf_page_id,pdf_explanation_id)
       VALUES ($1,$2,$3,$4,$5,$6,'completed',$7,$8,$9,$10::jsonb,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19)`,
      [
        id,
        input.ownerId,
        input.conversationId,
        context.sequence + index + 1,
        role,
        content,
        turnId,
        context.personality_key,
        PERSONALITY_CATALOG_VERSION,
        JSON.stringify(snapshots),
        context.skill_key,
        EDUCATIONAL_SKILL_VERSION,
        context.response_depth,
        JSON.stringify(role === 'assistant' ? references : []),
        role === 'assistant' ? input.model : null,
        role === 'assistant' ? 'pdf-study-chat-v2' : null,
        input.materialId,
        input.page.id,
        input.explanationId,
      ],
    );
    await client.query(
      `INSERT INTO pdf_study_turn(id,material_id,explanation_id,role,content,page_id,basis,cited_page_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        id,
        input.materialId,
        input.explanationId,
        role,
        content,
        input.page.id,
        plan.basis,
        JSON.stringify(pageCited ? [input.page.id] : []),
      ],
    );
  }
  await client.query(
    'UPDATE conversation SET version=version+1 WHERE owner_id=$1 AND id=$2',
    [input.ownerId, input.conversationId],
  );
}
