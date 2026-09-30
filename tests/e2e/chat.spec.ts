import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

const createdStudentIds: string[] = [];
const createdEmails: string[] = [];

test.afterEach(async () => {
  if (createdEmails.length === 0) {
    return;
  }
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL obrigatório para limpar o teste');
  }
  const pool = createPool(databaseUrl);
  try {
    const students = await pool.query<{ id: string }>(
      'SELECT id FROM student WHERE email=ANY($1::text[])',
      [createdEmails],
    );
    createdStudentIds.push(...students.rows.map((student) => student.id));
    const ids = [...new Set(createdStudentIds)];
    await pool.query(
      'DELETE FROM idempotency_record WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM operation_event WHERE owner_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query('DELETE FROM operation WHERE owner_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query('DELETE FROM message WHERE owner_id=ANY($1::uuid[])', [
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
  } finally {
    createdStudentIds.length = 0;
    createdEmails.length = 0;
    await pool.end();
  }
});

test('retoma o chat privado e muda o estilo por teclado em 360 px', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/cadastro');
  const ownerEmail = `chat-${crypto.randomUUID()}@example.invalid`;
  createdEmails.push(ownerEmail);
  await page.getByLabel('E-mail').fill(ownerEmail);
  await page.getByLabel('Senha').fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('radio', { name: /Acolhedora/ }).check();
  await page.getByLabel(/Nome da conversa/).fill('Estudo de biologia');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  const conversationUrl = page.url();
  const owner = (await (
    await page.context().request.get('/api/v1/auth/me')
  ).json()) as { id: string };
  createdStudentIds.push(owner.id);
  const question = page.getByLabel('Sua pergunta');
  await question.focus();
  await page.keyboard.type('Como funciona a fotossíntese?');
  await expect(question).toHaveValue('Como funciona a fotossíntese?');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByText(/Modo de demonstração \(/)).toBeVisible();
  await page.getByLabel('Estilo').selectOption('socratica');
  await expect(page.getByLabel('Estilo')).toHaveValue('socratica');
  await question.fill('Qual é a função da clorofila?');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByText(/Qual é a função da clorofila\?/)).toBeVisible();
  await expect(page.locator('article.message.assistant')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('article.message.assistant')).toHaveCount(2);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1,
      )
      .map((element) => ({
        element: element.tagName,
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .slice(0, 10),
  );
  expect(overflow).toEqual([]);

  const other = await browser.newPage({
    viewport: { width: 360, height: 780 },
  });
  try {
    await other.goto('/cadastro');
    const strangerEmail = `other-${crypto.randomUUID()}@example.invalid`;
    createdEmails.push(strangerEmail);
    await other.getByLabel('E-mail').fill(strangerEmail);
    await other.getByLabel('Senha').fill('valid-password-1234');
    await other.getByRole('button', { name: 'Criar conta' }).click();
    await expect(other).toHaveURL(/\/conversas$/);
    const stranger = (await (
      await other.context().request.get('/api/v1/auth/me')
    ).json()) as { id: string };
    createdStudentIds.push(stranger.id);
    expect(stranger.id).not.toBe(owner.id);
    await other.goto(conversationUrl);
    await expect(other.getByText('Conversa não encontrada.')).toBeVisible();
  } finally {
    await other.close();
  }
});
