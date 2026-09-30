import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { createPool, transaction } from '../../src/infrastructure/db/pool.js';
import { validateExamSources } from '../../src/modules/exams/exam-config.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('exam source validation', () => {
  it('accepts only active ready sources owned by the student', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const pool = createPool(databaseUrl);
    const owner = randomUUID();
    const other = randomUUID();
    const conversation = randomUUID();
    const siblingConversation = randomUUID();
    const otherConversation = randomUUID();
    const ready = randomUUID();
    const processing = randomUUID();
    const foreign = randomUUID();
    const siblingReady = randomUUID();
    try {
      for (const id of [owner, other]) {
        await pool.query(
          'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
          [id, `${id}@example.invalid`, 'hash'],
        );
      }
      await pool.query(
        "INSERT INTO conversation(id,owner_id,title,personality_key) VALUES ($1,$2,'Teste','objetiva'),($3,$4,'Outro','objetiva')",
        [conversation, owner, otherConversation, other],
      );
      await pool.query(
        "INSERT INTO conversation(id,owner_id,title,personality_key) VALUES ($1,$2,'Irmã','objetiva')",
        [siblingConversation, owner],
      );
      for (const [id, student, chat, state] of [
        [ready, owner, conversation, 'ready'],
        [processing, owner, conversation, 'processing'],
        [foreign, other, otherConversation, 'ready'],
        [siblingReady, owner, siblingConversation, 'ready'],
      ]) {
        await pool.query(
          'INSERT INTO material(id,owner_id,conversation_id,original_name,byte_size,checksum,object_key,state) VALUES ($1,$2,$3,$4,3,$5,$6,$7)',
          [id, student, chat, `${id}.txt`, id, `${student}/${id}`, state],
        );
      }
      await transaction(pool, async (client) => {
        expect(
          await validateExamSources(client, owner, conversation, [ready]),
        ).toMatchObject([{ id: ready, version: 1 }]);
        await expect(
          validateExamSources(client, owner, conversation, [processing]),
        ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
        await expect(
          validateExamSources(client, owner, conversation, [foreign]),
        ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
        await expect(
          validateExamSources(client, owner, conversation, [siblingReady]),
        ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
      });
      await pool.query('UPDATE material SET deleted_at=now() WHERE id=$1', [
        ready,
      ]);
      await transaction(pool, async (client) => {
        await expect(
          validateExamSources(client, owner, conversation, [ready]),
        ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
      });
    } finally {
      await pool.query('DELETE FROM material WHERE id=ANY($1::uuid[])', [
        [ready, processing, foreign, siblingReady],
      ]);
      await pool.query('DELETE FROM conversation WHERE id=ANY($1::uuid[])', [
        [conversation, otherConversation, siblingConversation],
      ]);
      await pool.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
        [owner, other],
      ]);
      await pool.end();
    }
  });
});
