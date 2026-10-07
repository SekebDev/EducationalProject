import type pg from 'pg';
import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import { createPool } from '../../infrastructure/db/pool.js';
import type { JobHandler } from '../../infrastructure/jobs/dispatcher.js';
import { MaterialStorage } from '../../infrastructure/storage/material-storage.js';
import { extractMaterial } from './extract.js';
import { chunkSegments, vectorLiteral } from './retrieval.js';

type MaterialRow = {
  detected_mime:
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    | 'text/plain';
  version: number;
};

export function createExtractJobHandler(databaseUrl: string): JobHandler {
  const pool = createPool(databaseUrl);
  const config = readConfig(process.env);
  const storage = new MaterialStorage(pool, config);
  const provider = createAiProvider(config);
  return async (lease) => {
    const found = await pool.query<MaterialRow>(
      `SELECT m.detected_mime,m.version FROM material m
       JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id AND c.deleted_at IS NULL
       WHERE m.owner_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND m.state='processing'`,
      [lease.ownerId, lease.resourceId],
    );
    const material = found.rows[0];
    if (!material) {
      throw new Error('MATERIAL_UNAVAILABLE');
    }
    const bytes = await storage.read(lease.ownerId, lease.resourceId);
    const segments = await extractMaterial(material.detected_mime, bytes);
    const chunks = chunkSegments(segments);
    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += 32) {
      const active = await pool.query(
        `SELECT 1 FROM operation o JOIN material m ON m.id=o.resource_id AND m.owner_id=o.owner_id
         JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
         WHERE o.id=$1 AND o.owner_id=$2 AND o.fence_version=$3 AND o.state='running'
         AND o.lease_until>now() AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND m.version=$4`,
        [lease.id, lease.ownerId, lease.fenceVersion, material.version],
      );
      if (!active.rowCount) throw new Error('MATERIAL_UNAVAILABLE');
      embeddings.push(
        ...(await provider.embed(
          chunks.slice(start, start + 32).map((chunk) => chunk.text),
        )),
      );
    }
    if (embeddings.length !== chunks.length) {
      throw new Error('EMBEDDING_INVALID');
    }
    return {
      apply: async (client: pg.PoolClient) => {
        const current = await client.query(
          `SELECT 1 FROM material m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
           WHERE m.owner_id=$1 AND m.id=$2 AND m.version=$3 AND m.deleted_at IS NULL
             AND c.deleted_at IS NULL AND m.state='processing' FOR UPDATE OF m`,
          [lease.ownerId, lease.resourceId, material.version],
        );
        if (!current.rowCount) {
          throw new Error('MATERIAL_UNAVAILABLE');
        }
        await client.query(
          'DELETE FROM material_chunk WHERE owner_id=$1 AND material_id=$2 AND extraction_version=$3',
          [lease.ownerId, lease.resourceId, material.version],
        );
        for (let index = 0; index < chunks.length; index++) {
          const chunk = chunks[index];
          const embedding = embeddings[index];
          if (!chunk || !embedding) {
            throw new Error('EMBEDDING_INVALID');
          }
          await client.query(
            `INSERT INTO material_chunk(owner_id,material_id,extraction_version,ordinal,text,locator,token_count,embedding,embedding_model)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::vector,$9)`,
            [
              lease.ownerId,
              lease.resourceId,
              material.version,
              index + 1,
              chunk.text,
              JSON.stringify(chunk.locator),
              Math.ceil(chunk.text.length / 4),
              vectorLiteral(embedding),
              config.aiProvider === 'fake'
                ? 'fake-v1'
                : (process.env.OPENAI_EMBEDDING_MODEL ??
                  'text-embedding-3-small'),
            ],
          );
        }
        await client.query(
          "UPDATE material SET state='ready',error_code=NULL,version=version+1 WHERE owner_id=$1 AND id=$2",
          [lease.ownerId, lease.resourceId],
        );
      },
    };
  };
}
