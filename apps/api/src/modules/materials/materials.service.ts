import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { recordDeletion } from '../../infrastructure/deletion/deletion-record.js';
import { withIdempotency } from '../../infrastructure/http/idempotency.js';
import { OperationRepository } from '../../infrastructure/jobs/operations.js';
import {
  MaterialStorage,
  objectKey,
} from '../../infrastructure/storage/material-storage.js';
import { detectMaterialMime } from './upload.js';
import type { UploadedMaterial } from './upload.js';

type MaterialRow = {
  id: string;
  conversation_id: string;
  original_name: string;
  detected_mime: string | null;
  byte_size: number;
  state: string;
  error_code: string | null;
  version: number;
  created_at: Date;
  selected?: boolean;
};

@Injectable()
export class MaterialsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );
  private readonly storage = new MaterialStorage(
    this.pool,
    readConfig(process.env),
  );

  async upload(
    ownerId: string,
    conversationId: string,
    key: string,
    file: UploadedMaterial,
  ) {
    const name = file.name.trim().slice(0, 255);
    if (!name || file.bytes.length === 0 || file.bytes.length > 20_000_000) {
      throw new PublicError(
        413,
        'FILE_SIZE_INVALID',
        'Arquivo fora do limite de 20 MB.',
      );
    }
    const mime = detectMaterialMime(name, file.bytes, file.declaredMime);
    const checksum = createHash('sha256').update(file.bytes).digest('hex');
    const result = await withIdempotency(
      this.pool,
      {
        ownerId,
        route: `POST /conversations/${conversationId}/materials`,
        key,
        body: { name, mime, checksum, byteSize: file.bytes.length },
      },
      async (client) => {
        const conversation = await client.query(
          'SELECT id FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',
          [ownerId, conversationId],
        );
        if (!conversation.rowCount) {
          throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
        }
        const count = await client.query<{ total: string }>(
          'SELECT count(*)::text AS total FROM material WHERE owner_id=$1 AND conversation_id=$2 AND deleted_at IS NULL',
          [ownerId, conversationId],
        );
        if (Number(count.rows[0]?.total) >= 10) {
          throw new PublicError(
            409,
            'MATERIAL_LIMIT',
            'A conversa já possui dez materiais ativos.',
          );
        }
        const id = randomUUID();
        await client.query(
          `INSERT INTO material(id,owner_id,conversation_id,original_name,detected_mime,byte_size,checksum,object_key,state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received')`,
          [
            id,
            ownerId,
            conversationId,
            name,
            mime,
            file.bytes.length,
            checksum,
            objectKey(ownerId, id),
          ],
        );
        await this.operations.create(client, {
          ownerId,
          resourceId: id,
          kind: 'extract-material',
          dedupeKey: key,
          inputVersion: 1,
        });
        return { resourceId: id, status: 202 };
      },
      async (client, id) =>
        (
          await client.query(
            'SELECT 1 FROM material WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
            [ownerId, id],
          )
        ).rowCount !== 0,
    );
    if (!result.replay) {
      try {
        await this.storage.put(ownerId, result.resourceId, file.bytes);
        await this.pool.query(
          "UPDATE material SET state='processing' WHERE owner_id=$1 AND id=$2 AND state='received' AND deleted_at IS NULL",
          [ownerId, result.resourceId],
        );
      } catch {
        await this.pool.query(
          "UPDATE material SET state='failed',error_code='STORAGE_UNAVAILABLE' WHERE owner_id=$1 AND id=$2 AND state='received'",
          [ownerId, result.resourceId],
        );
        throw new PublicError(
          503,
          'STORAGE_UNAVAILABLE',
          'Não foi possível armazenar o material.',
          true,
        );
      }
    }
    const operation = await this.pool.query<{ id: string }>(
      "SELECT id FROM operation WHERE owner_id=$1 AND resource_id=$2 AND kind='extract-material'",
      [ownerId, result.resourceId],
    );
    return {
      materialId: result.resourceId,
      state: 'received',
      operationId: operation.rows[0]?.id,
    };
  }

  async list(ownerId: string, conversationId: string) {
    const exists = await this.pool.query(
      'SELECT 1 FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
      [ownerId, conversationId],
    );
    if (!exists.rowCount) {
      throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
    }
    const rows = await this.pool.query<MaterialRow>(
      `SELECT m.id,m.conversation_id,m.original_name,m.detected_mime,m.byte_size,m.state,m.error_code,m.version,m.created_at,
        (s.material_id IS NOT NULL) AS selected FROM material m
       LEFT JOIN conversation_source s ON s.owner_id=m.owner_id AND s.conversation_id=m.conversation_id AND s.material_id=m.id
       WHERE m.owner_id=$1 AND m.conversation_id=$2 AND m.deleted_at IS NULL ORDER BY m.created_at,m.id`,
      [ownerId, conversationId],
    );
    return { items: rows.rows.map((row) => this.view(row)) };
  }

  async get(ownerId: string, id: string) {
    const found = await this.pool.query<MaterialRow>(
      `SELECT m.id,m.conversation_id,m.original_name,m.detected_mime,m.byte_size,m.state,m.error_code,m.version,m.created_at,
        (s.material_id IS NOT NULL) AS selected FROM material m
       JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id AND c.deleted_at IS NULL
       LEFT JOIN conversation_source s ON s.owner_id=m.owner_id AND s.conversation_id=m.conversation_id AND s.material_id=m.id
       WHERE m.owner_id=$1 AND m.id=$2 AND m.deleted_at IS NULL`,
      [ownerId, id],
    );
    const row = found.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Material não encontrado.');
    }
    return this.view(row);
  }

  async content(ownerId: string, id: string) {
    const metadata = await this.get(ownerId, id);
    return { metadata, bytes: await this.storage.read(ownerId, id) };
  }

  async chunk(ownerId: string, materialId: string, chunkId: string) {
    const result = await this.pool.query<{
      id: string;
      text: string;
      locator: unknown;
    }>(
      `SELECT chunk.id,chunk.text,chunk.locator FROM material_chunk chunk
       JOIN material m ON m.owner_id=chunk.owner_id AND m.id=chunk.material_id
       JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id
       WHERE chunk.owner_id=$1 AND chunk.material_id=$2 AND chunk.id=$3
         AND chunk.extraction_version=m.version-1 AND m.state='ready' AND m.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [ownerId, materialId, chunkId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Trecho não encontrado.');
    }
    return row;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deleted = await client.query(
        `UPDATE material m SET deleted_at=now(),version=m.version+1 FROM conversation c
         WHERE m.owner_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND c.owner_id=m.owner_id
         AND c.id=m.conversation_id AND c.deleted_at IS NULL RETURNING m.id`,
        [ownerId, id],
      );
      if (!deleted.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Material não encontrado.');
      }
      await recordDeletion(client, ownerId, 'material', id);
      await client.query(
        'DELETE FROM conversation_source WHERE owner_id=$1 AND material_id=$2',
        [ownerId, id],
      );
      await client.query(
        `UPDATE operation SET state='cancelled',phase='cancelled',fence_version=fence_version+1,lease_until=NULL,updated_at=now()
         WHERE owner_id=$1 AND resource_id=$2 AND kind IN ('extract-material','embed-material') AND state IN ('pending','running')`,
        [ownerId, id],
      );
    });
  }

  private view(row: MaterialRow) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      name: row.original_name,
      mime: row.detected_mime,
      bytes: row.byte_size,
      state: row.state,
      error: row.error_code,
      version: row.version,
      selected: Boolean(row.selected),
      createdAt: row.created_at,
    };
  }
}
