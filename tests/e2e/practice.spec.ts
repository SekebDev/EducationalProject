import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

test('resultado inicia prática nova e preserva a prova anterior', async ({
  page,
}) => {
  const email = `practice-${crypto.randomUUID()}@example.invalid`;
  await page.goto('/cadastro');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  const student = (
    await pool.query<{ id: string }>('SELECT id FROM student WHERE email=$1', [
      email,
    ])
  ).rows[0]!.id;
  try {
    await page.goto('/conversas/nova');
    await page.getByRole('button', { name: 'Começar conversa' }).click();
    await page.getByLabel('Sua pergunta').fill('Explique ecologia.');
    await page.getByRole('button', { name: 'Enviar pergunta' }).click();
    await expect(page.getByText(/Modo de demonstração/)).toBeVisible();
    await page
      .getByRole('link', { name: 'Criar prova desta conversa' })
      .click();
    await page.getByLabel('Temas separados por vírgula').fill('Ecologia');
    await page.getByRole('button', { name: 'Gerar prova' }).click();
    await expect(
      page.getByRole('link', { name: 'Responder prova' }),
    ).toBeVisible();
    const firstExam = page.url();
    const firstStatement = await page
      .locator('.question-preview h3')
      .first()
      .textContent();
    await page.getByRole('link', { name: 'Responder prova' }).click();
    for (let index = 0; index < 3; index++) {
      const question = page.locator('.question-preview').nth(index);
      await question.getByRole('radio', { name: /B\. Alternativa/ }).check();
      await question
        .getByRole('button', { name: 'Confirmar resposta' })
        .click();
      await expect(question.getByText('Alternativa correta: A')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Entregar tentativa' }).click();
    await page
      .getByRole('button', {
        name: 'Confirmar entrega com respostas em branco',
      })
      .click();
    await page.getByRole('link', { name: 'Ver resultado' }).click();
    await expect(page).toHaveURL(/\/resultado$/);
    const firstResult = page.url();
    await page.getByRole('link', { name: 'Ver evolução' }).click();
    await expect(
      page.getByRole('link', { name: 'Praticar este tema' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Praticar este tema' }).click();
    await expect(
      page.getByText(/Nova prática a partir de uma recomendação/),
    ).toBeVisible();
    await expect(page.getByLabel('Temas separados por vírgula')).toHaveValue(
      'Ecologia',
    );
    await expect(page.getByLabel('Total')).toHaveValue('10');
    await expect(page.getByLabel('Objetivas')).toHaveValue('5');
    await page.getByRole('button', { name: 'Gerar prova' }).click();
    await expect(
      page.getByRole('link', { name: 'Responder prova' }),
    ).toBeVisible();
    expect(page.url()).not.toBe(firstExam);
    expect(
      await page.locator('.question-preview h3').first().textContent(),
    ).not.toBe(firstStatement);
    await page.goto(firstResult);
    await expect(
      page.getByRole('heading', { name: 'Resultado da tentativa' }),
    ).toBeVisible();
    await expect(page.getByText('Erros')).toBeVisible();
  } finally {
    for (const table of [
      'dispute',
      'grade_current',
      'grade_revision',
      'answer',
      'attempt',
      'question_secret',
      'question',
      'exam_source',
      'exam_topic',
      'exam',
      'recommendation',
      'topic',
      'operation_event',
      'operation',
      'idempotency_record',
      'message',
      'conversation',
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE owner_id=$1`, [student]);
    }
    await pool.query('DELETE FROM session WHERE student_id=$1', [student]);
    await pool.query('DELETE FROM student WHERE id=$1', [student]);
    await pool.end();
  }
});
