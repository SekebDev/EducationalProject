import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

const emails: string[] = [];

async function expectKeyboardFocus(page: import('@playwright/test').Page) {
  let visible = false;
  for (let index = 0; index < 12 && !visible; index++) {
    await page.keyboard.press('Tab');
    visible = await page.evaluate(() => {
      const element = document.activeElement;
      return (
        element !== document.body &&
        Boolean(element?.matches(':focus-visible')) &&
        getComputedStyle(element!).outlineStyle !== 'none'
      );
    });
  }
  expect(visible).toBe(true);
}

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
    const ids = students.rows.map((student) => student.id);
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
      'topic',
      'operation_event',
      'operation',
      'idempotency_record',
      'message',
      'conversation',
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE owner_id=ANY($1::uuid[])`, [
        ids,
      ]);
    }
    await pool.query('DELETE FROM session WHERE student_id=ANY($1::uuid[])', [
      ids,
    ]);
    await pool.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [ids]);
  } finally {
    emails.length = 0;
    await pool.end();
  }
});

test('prova, rascunho, correção parcial e entrega com brancas', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cadastro');
  const email = `exam-${crypto.randomUUID()}@example.invalid`;
  emails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  await page.getByLabel('Sua pergunta').fill('Explique ecologia.');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByText(/Modo de demonstração/)).toBeVisible();
  await page.getByRole('link', { name: 'Criar prova desta conversa' }).click();
  await page.getByLabel('Temas separados por vírgula').fill('Ecologia');
  await page.getByRole('button', { name: 'Gerar prova' }).click();
  await expect(page).toHaveURL(/\/provas\/[a-f0-9-]+$/);
  await page.getByRole('link', { name: 'Responder prova' }).click();
  await expect(page).toHaveURL(/\/tentativas\/[a-f0-9-]+$/);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `Tentativa a ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
      `Axe na tentativa a ${width}px`,
    ).toEqual([]);
    await expectKeyboardFocus(page);
    await page.screenshot({
      path: test.info().outputPath(`tentativa-${width}.png`),
      fullPage: true,
    });
  }
  const attemptUrl = page.url();
  const question = page.locator('.question-preview').first();
  const option = question.getByRole('radio', { name: /A\. Alternativa/ });
  await option.focus();
  await page.keyboard.press('Space');
  await expect(option).toBeChecked();
  await expect(question.getByText('Alternativa correta: A')).toHaveCount(0);
  await expect(
    question.getByText('Rascunho salvo automaticamente'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('.question-preview')
      .first()
      .getByRole('radio', { name: /A\. Alternativa/ }),
  ).toBeChecked();
  await page
    .locator('.question-preview')
    .first()
    .getByRole('button', { name: 'Confirmar resposta' })
    .press('Enter');
  await expect(
    page
      .locator('.question-preview')
      .first()
      .getByText('Alternativa correta: A'),
  ).toBeVisible();
  const essay = page.locator('.question-preview').nth(5);
  await essay
    .getByRole('textbox', { name: 'Sua resposta' })
    .fill('Resposta parcial');
  await essay
    .getByRole('button', { name: 'Confirmar resposta' })
    .press('Enter');
  await expect(essay.getByText(/Resposta confirmada|Nota:/)).toBeVisible();
  await page.getByRole('button', { name: 'Entregar tentativa' }).press('Enter');
  await expect(
    page.getByRole('button', {
      name: 'Confirmar entrega com respostas em branco',
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Confirmar entrega com respostas em branco' })
    .click();
  await expect(page.getByRole('link', { name: 'Ver resultado' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver resultado' }).click();
  await expect(page).toHaveURL(/\/resultado$/);
  await expect(page.getByText('Em branco')).toBeVisible();
  await expect(page.getByText('Contestadas')).toBeVisible();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `Resultado a ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
      `Axe no resultado a ${width}px`,
    ).toEqual([]);
    await expectKeyboardFocus(page);
    await page.screenshot({
      path: test.info().outputPath(`resultado-${width}.png`),
      fullPage: true,
    });
  }
  const graded = page.locator('.question-preview').first();
  await graded
    .getByLabel('Contestar correção')
    .fill('Quero revisar a correção da questão.');
  await graded.getByRole('button', { name: 'Enviar contestação' }).click();
  await expect(graded.getByText('Contestada', { exact: true })).toBeVisible();
  await graded.getByRole('button', { name: 'Solicitar reavaliação' }).click();
  await expect(graded.getByText('Corrigida', { exact: true })).toBeVisible();
  await page.goto(attemptUrl);
  await expect(
    page
      .locator('.question-preview')
      .first()
      .getByText('Alternativa correta: A'),
  ).toBeVisible();
});
