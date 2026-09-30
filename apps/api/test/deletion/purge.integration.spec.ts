import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { createPool } from '../../src/infrastructure/db/pool.js';
import { readConfig } from '../../src/infrastructure/config.js';
import { DeletionPurger } from '../../src/infrastructure/deletion/purge.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import {
  MaterialStorage,
  objectKey,
} from '../../src/infrastructure/storage/material-storage.js';
import { MaterialsService } from '../../src/modules/materials/materials.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('purga de exclusões', () => {
  it('revoga material imediatamente e apaga arquivo/chunks depois do prazo', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const root = await mkdtemp(join(tmpdir(), 'study-purge-'));
    const previous = Object.fromEntries(
      [
        'DATABASE_URL',
        'APP_ORIGIN',
        'SESSION_SECRET',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_FROM',
        'STORAGE_LOCAL_PATH',
      ].map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
      STORAGE_LOCAL_PATH: root,
    });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const pool = createPool(databaseUrl);
    const storage = new MaterialStorage(pool, readConfig(process.env));
    const owner = randomUUID();
    const conversation = randomUUID();
    const material = randomUUID();
    try {
      await client.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [owner, `${owner}@example.invalid`, 'hash'],
      );
      await client.query(
        "INSERT INTO conversation(id,owner_id,title,personality_key) VALUES ($1,$2,'Teste','objetiva')",
        [conversation, owner],
      );
      await client.query(
        "INSERT INTO material(id,owner_id,conversation_id,original_name,detected_mime,byte_size,checksum,object_key,state) VALUES ($1,$2,$3,'anotacoes.txt','text/plain',5,'hash',$4,'ready')",
        [material, owner, conversation, objectKey(owner, material)],
      );
      await storage.put(owner, material, new TextEncoder().encode('texto'));
      await client.query(
        "INSERT INTO material_chunk(owner_id,material_id,extraction_version,ordinal,text,locator,token_count) VALUES ($1,$2,1,1,'texto','{}'::jsonb,1)",
        [owner, material],
      );
      await new MaterialsService().delete(owner, material);
      const operation = await client.query<{ id: string }>(
        "INSERT INTO operation(owner_id,kind,resource_id,dedupe_key,state,input_version) VALUES ($1,'extract-material',$2,$3,'cancelled',1) RETURNING id",
        [owner, material, randomUUID()],
      );
      const operations = new OperationRepository(databaseUrl);
      try {
        await expect(
          operations.get(owner, operation.rows[0]!.id),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        await operations.pool.end();
      }
      await expect(storage.read(owner, material)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      const record = await client.query<{ purge_state: string }>(
        "SELECT purge_state FROM deletion_record WHERE resource_type='material' AND resource_id=$1",
        [material],
      );
      expect(record.rows[0]?.purge_state).toBe('pending');
      const purger = new DeletionPurger(databaseUrl);
      try {
        const failure = vi
          .spyOn(MaterialStorage.prototype, 'purge')
          .mockRejectedValueOnce(new Error('STORAGE_TEMPORARILY_UNAVAILABLE'));
        try {
          await expect(purger.purgeDue(0)).rejects.toThrow(
            'STORAGE_TEMPORARILY_UNAVAILABLE',
          );
        } finally {
          failure.mockRestore();
        }
        expect(
          (
            await client.query(
              "SELECT purge_state FROM deletion_record WHERE resource_type='material' AND resource_id=$1",
              [material],
            )
          ).rows[0]?.purge_state,
        ).toBe('pending');
        expect(await purger.purgeDue(0)).toBeGreaterThanOrEqual(1);
      } finally {
        await purger.close();
      }
      expect(
        (await client.query('SELECT 1 FROM material WHERE id=$1', [material]))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT 1 FROM material_chunk WHERE material_id=$1',
            [material],
          )
        ).rowCount,
      ).toBe(0);
      await expect(readFile(join(root, owner, material))).rejects.toMatchObject(
        { code: 'ENOENT' },
      );
      expect(
        (
          await client.query(
            "SELECT purge_state FROM deletion_record WHERE resource_type='material' AND resource_id=$1",
            [material],
          )
        ).rows[0]?.purge_state,
      ).toBe('purged');
      await client.query(
        "INSERT INTO deletion_record(owner_id,resource_type,resource_id,deleted_at,purge_state) VALUES ($1,'conversation',$2,now(),'pending')",
        [owner, conversation],
      );
      await client.query(
        await readFile(
          join(process.cwd(), 'scripts/replay-deletions.sql'),
          'utf8',
        ),
      );
      expect(
        (
          await client.query(
            'SELECT deleted_at FROM conversation WHERE id=$1',
            [conversation],
          )
        ).rows[0]?.deleted_at,
      ).not.toBeNull();
      const replayPurger = new DeletionPurger(databaseUrl);
      try {
        expect(await replayPurger.purgeDue(0)).toBeGreaterThanOrEqual(1);
      } finally {
        await replayPurger.close();
      }
      expect(
        (
          await client.query('SELECT 1 FROM conversation WHERE id=$1', [
            conversation,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await client.end();
      await pool.end();
      await rm(root, { recursive: true, force: true });
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
