import { randomUUID } from 'node:crypto';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/infrastructure/db/migrate.js';
import { createPool } from '../src/infrastructure/db/pool.js';
import {
  MaterialStorage,
  objectKey,
} from '../src/infrastructure/storage/material-storage.js';
import type { AppConfig } from '../src/infrastructure/config.js';

describe('private object key', () => {
  it('accepts only owner and material UUIDs', () => {
    const owner = randomUUID();
    const material = randomUUID();
    expect(objectKey(owner, material)).toBe(`${owner}/${material}`);
    expect(() => objectKey('../other', material)).toThrow('ID inválido');
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('material storage', () => {
  it('revokes reads immediately after logical deletion', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const pool = createPool(databaseUrl);
    const root = await mkdtemp(join(tmpdir(), 'study-storage-'));
    const ownerId = randomUUID();
    const conversationId = randomUUID();
    const materialId = randomUUID();
    const key = objectKey(ownerId, materialId);
    const config = {
      storageDriver: 'local',
      storageLocalPath: root,
    } as AppConfig;
    const storage = new MaterialStorage(pool, config);
    try {
      await pool.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [ownerId, `${ownerId}@example.invalid`, 'hash'],
      );
      await pool.query(
        "INSERT INTO conversation(id,owner_id,title,personality_key) VALUES ($1,$2,'Teste','objetiva')",
        [conversationId, ownerId],
      );
      await pool.query(
        "INSERT INTO material(id,owner_id,conversation_id,original_name,byte_size,checksum,object_key,state) VALUES ($1,$2,$3,'a.txt',3,'hash',$4,'received')",
        [materialId, ownerId, conversationId, key],
      );
      await storage.put(ownerId, materialId, Buffer.from('abc'));
      expect(
        Buffer.from(await storage.read(ownerId, materialId)).toString(),
      ).toBe('abc');
      await pool.query('UPDATE material SET deleted_at=now() WHERE id=$1', [
        materialId,
      ]);
      await expect(storage.read(ownerId, materialId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await storage.purge(key);
    } finally {
      await pool.query('DELETE FROM material WHERE id=$1', [materialId]);
      await pool.query('DELETE FROM conversation WHERE id=$1', [
        conversationId,
      ]);
      await pool.query('DELETE FROM student WHERE id=$1', [ownerId]);
      await pool.end();
      await rmdir(join(root, ownerId)).catch(() => undefined);
      await rmdir(root).catch(() => undefined);
    }
  });
});
