import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

test('recupera senha por link e explica sessão expirada', async ({ page }) => {
  const email = `reset-${crypto.randomUUID()}@example.invalid`;
  await page.goto('/cadastro');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  const student = (
    await pool.query<{ id: string }>('SELECT id FROM student WHERE email=$1', [
      email,
    ])
  ).rows[0]!.id;
  try {
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('E-mail').fill(email);
    await expect(page.getByLabel('E-mail')).toHaveValue(email);
    await page.getByRole('button', { name: 'Enviar instruções' }).click();
    await expect(
      page.getByText(/Se o e-mail estiver cadastrado/),
    ).toBeVisible();
    let link = '';
    await expect
      .poll(async () => {
        const response = await fetch('http://127.0.0.1:8025/api/v1/messages');
        const list = (await response.json()) as {
          messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
        };
        const matching = list.messages.find((message) =>
          message.To?.some((recipient) => recipient.Address === email),
        );
        if (!matching) {
          return false;
        }
        const detail = (await (
          await fetch(`http://127.0.0.1:8025/api/v1/message/${matching.ID}`)
        ).json()) as { Text: string };
        link =
          detail.Text.match(
            /https?:\/\/[^\s]+\/recuperar-senha\?token=[^\s]+/,
          )?.[0] ?? '';
        return Boolean(link);
      })
      .toBe(true);
    await page.goto(link);
    await page.getByLabel('Senha').fill('new-valid-password-5678');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(
      page.getByText('Senha alterada. Entre com a nova senha.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Já tenho uma conta' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('new-valid-password-5678');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/conversas$/);
    await pool.query(
      'UPDATE session SET revoked_at=now() WHERE student_id=$1 AND revoked_at IS NULL',
      [student],
    );
    await page.goto('/conversas');
    await expect(page).toHaveURL(/\/entrar\?expired=1/);
    await expect(
      page.getByText('Sua sessão terminou. Entre novamente para continuar.'),
    ).toBeVisible();
  } finally {
    await pool.query('DELETE FROM password_reset WHERE student_id=$1', [
      student,
    ]);
    await pool.query('DELETE FROM session WHERE student_id=$1', [student]);
    await pool.query('DELETE FROM student WHERE id=$1', [student]);
    await pool.end();
  }
});
