import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

const emails: string[] = [];

test.afterEach(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL obrigatório');
  }
  const pool = createPool(databaseUrl);
  try {
    const students = await pool.query<{ id: string }>(
      'SELECT id FROM student WHERE email=ANY($1::text[])',
      [emails],
    );
    const ids = students.rows.map((row) => row.id);
    const materials = await pool.query<{ id: string; owner_id: string }>(
      'SELECT id,owner_id FROM material WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM material_chunk WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM conversation_source WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM operation_event WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query('DELETE FROM operation WHERE owner_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query(
      'DELETE FROM idempotency_record WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query('DELETE FROM message WHERE owner_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query('DELETE FROM material WHERE owner_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query(
      'DELETE FROM conversation WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query('DELETE FROM session WHERE student_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [ids]);
    for (const material of materials.rows) {
      await rm(resolve('.local-storage-e2e', material.owner_id, material.id), {
        force: true,
      });
    }
  } finally {
    emails.length = 0;
    await pool.end();
  }
});

test('material privado, fonte por linha e revogação a 360 px', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/cadastro');
  const email = `material-${crypto.randomUUID()}@example.invalid`;
  emails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  const conversationId = page.url().split('/').at(-1);
  if (!conversationId) {
    throw new Error('Conversa ausente');
  }
  const panel = page.locator('.materials-panel');
  await panel.locator('input[type=file]').setInputFiles({
    name: 'aula.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Primeira linha\nFotossíntese usa luz.'),
  });
  await panel.getByRole('button', { name: 'Enviar arquivo' }).click();
  await expect(panel.getByText('Pronto')).toBeVisible();
  await panel.getByRole('checkbox', { name: 'aula.txt' }).click();
  await expect(panel.getByRole('checkbox', { name: 'aula.txt' })).toBeChecked();
  await page.getByLabel('Sua pergunta').fill('O que diz o material?');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByText(/não sustentam uma resposta/)).toBeVisible();

  const pool = createPool(process.env.TEST_DATABASE_URL ?? '');
  let materialId: string;
  let chunkId: string;
  try {
    const material = await pool.query<{ id: string; owner_id: string }>(
      'SELECT id,owner_id FROM material WHERE conversation_id=$1 AND deleted_at IS NULL',
      [conversationId],
    );
    materialId = material.rows[0]?.id ?? '';
    const ownerId = material.rows[0]?.owner_id ?? '';
    const chunk = await pool.query<{ id: string }>(
      "SELECT id FROM material_chunk WHERE material_id=$1 AND locator->>'kind'='line' AND (locator->>'number')::int=2",
      [materialId],
    );
    chunkId = chunk.rows[0]?.id ?? '';
    expect(chunkId).toBeTruthy();
    const sequence = await pool.query<{ sequence: number }>(
      'SELECT max(sequence)+1 AS sequence FROM message WHERE conversation_id=$1',
      [conversationId],
    );
    const next = Number(sequence.rows[0]?.sequence);
    const turnId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot)
       VALUES ($1,$2,$3,'user','Mostre a fonte','completed',$4,'acolhedora')`,
      [ownerId, conversationId, next, turnId],
    );
    await pool.query(
      `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot,references_json)
       VALUES ($1,$2,$3,'assistant','A luz aparece no material.','completed',$4,'acolhedora',$5::jsonb)`,
      [
        ownerId,
        conversationId,
        next + 1,
        turnId,
        JSON.stringify([
          {
            materialId,
            chunkId,
            name: 'aula.txt',
            locator: { kind: 'line', number: 2 },
            available: true,
          },
        ]),
      ],
    );
  } finally {
    await pool.end();
  }
  await page.reload();
  await page.getByRole('button', { name: 'aula.txt, linha 2' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Trecho da fonte' }),
  ).toContainText('Fotossíntese usa luz.');

  const other = await browser.newPage();
  try {
    await other.goto('/cadastro');
    const otherEmail = `material-other-${crypto.randomUUID()}@example.invalid`;
    emails.push(otherEmail);
    await other.getByLabel('E-mail').fill(otherEmail);
    await other.getByLabel('Senha').fill('valid-password-1234');
    await other.getByRole('button', { name: 'Criar conta' }).click();
    await expect(other).toHaveURL(/\/conversas$/);
    expect(
      (
        await other
          .context()
          .request.get(`/api/v1/materials/${materialId}/chunks/${chunkId}`)
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }

  page.once('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'Excluir' }).click();
  await expect(panel.getByText('aula.txt')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Fonte indisponível · aula.txt')).toBeVisible();
  expect(
    (
      await page
        .context()
        .request.get(`/api/v1/materials/${materialId}/content`)
    ).status(),
  ).toBe(404);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
