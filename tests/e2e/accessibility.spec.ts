import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const raw = hex.replace('#', '');
    const expanded =
      raw.length === 3 ? [...raw].map((part) => part + part).join('') : raw;
    const rgb = expanded.match(/../g)!.map((part) => parseInt(part, 16) / 255);
    const channels = rgb.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return (
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    );
  };
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

test('contraste, axe, foco e largura em cinco fluxos e quatro larguras', async ({
  page,
}) => {
  const email = `access-${crypto.randomUUID()}@example.invalid`;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/entrar');
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      ['--ink', '--paper', '--accent', '--muted', '--canvas', '--focus'].map(
        (key) => [key, style.getPropertyValue(key).trim()],
      ),
    );
  });
  expect(contrast(colors['--ink']!, colors['--paper']!)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(
    contrast(colors['--muted']!, colors['--paper']!),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(colors['--accent']!, colors['--paper']!),
  ).toBeGreaterThanOrEqual(4.5);
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  let student = '';
  try {
    await page.goto('/cadastro');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('valid-password-1234');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page).toHaveURL(/\/conversas$/);
    student = (
      await pool.query<{ id: string }>(
        'SELECT id FROM student WHERE email=$1',
        [email],
      )
    ).rows[0]!.id;
    await page.goto('/conversas/nova');
    await page.getByRole('button', { name: 'Começar conversa' }).click();
    await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
    const conversationUrl = page.url();
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        '/conversas',
        conversationUrl,
        '/provas/nova',
        '/evolucao',
        '/entrar',
      ]) {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${route} a ${width}px`).toBeLessThanOrEqual(1);
        let visibleFocus = false;
        for (let index = 0; index < 12; index++) {
          await page.keyboard.press('Tab');
          visibleFocus = await page.evaluate(() => {
            const element = document.activeElement;
            return (
              element !== document.body &&
              Boolean(element?.matches(':focus-visible')) &&
              getComputedStyle(element!).outlineStyle !== 'none'
            );
          });
          if (visibleFocus) {
            break;
          }
        }
        expect(visibleFocus, `Foco visível em ${route} a ${width}px`).toBe(
          true,
        );
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(
          accessibility.violations,
          `Axe em ${route} a ${width}px: ${accessibility.violations.map((item) => item.id).join(', ')}`,
        ).toEqual([]);
        if (route === '/evolucao') {
          await page.screenshot({
            path: test.info().outputPath(`evolucao-${width}.png`),
            fullPage: true,
          });
        }
      }
    }
  } finally {
    if (student) {
      await pool.query('DELETE FROM conversation WHERE owner_id=$1', [student]);
      await pool.query('DELETE FROM idempotency_record WHERE owner_id=$1', [
        student,
      ]);
      await pool.query('DELETE FROM session WHERE student_id=$1', [student]);
      await pool.query('DELETE FROM student WHERE id=$1', [student]);
    }
    await pool.end();
  }
});
