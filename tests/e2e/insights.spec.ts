import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

test('evolução filtra nível e período e explica amostra insuficiente', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = `insights-${crypto.randomUUID()}@example.invalid`;
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
    const topic = (
      await pool.query<{ id: string }>(
        "INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,'História','história') RETURNING id",
        [student],
      )
    ).rows[0]!.id;
    const seed = async (
      level: string,
      date: string,
      units: number,
      state = 'graded',
    ) => {
      const exam = (
        await pool.query<{ id: string }>(
          "INSERT INTO exam(owner_id,title,study_level,total,objective_count,essay_count,state) VALUES ($1,'Teste',$2,10,5,5,'ready') RETURNING id",
          [student, level],
        )
      ).rows[0]!.id;
      const question = (
        await pool.query<{ id: string }>(
          "INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash,alternatives) VALUES ($1,$2,1,$3,$4,'objective','Questão de teste',$5,'[]'::jsonb) RETURNING id",
          [student, exam, topic, level, crypto.randomUUID()],
        )
      ).rows[0]!.id;
      const attempt = (
        await pool.query<{ id: string }>(
          "INSERT INTO attempt(owner_id,exam_id,state,submitted_at) VALUES ($1,$2,'completed',$3) RETURNING id",
          [student, exam, date],
        )
      ).rows[0]!.id;
      const answer = (
        await pool.query<{ id: string }>(
          "INSERT INTO answer(owner_id,attempt_id,question_id,state,confirmed_at) VALUES ($1,$2,$3,'graded',now()) RETURNING id",
          [student, attempt, question],
        )
      ).rows[0]!.id;
      const revision = (
        await pool.query<{ id: string }>(
          "INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,explanation) VALUES ($1,$2,1,'objective',$3,'Teste') RETURNING id",
          [student, answer, units],
        )
      ).rows[0]!.id;
      await pool.query(
        'INSERT INTO grade_current(owner_id,answer_id,current_revision_id,state) VALUES ($1,$2,$3,$4)',
        [student, answer, revision, state],
      );
    };
    await seed('Médio', '2026-01-02T03:30:00Z', 5999);
    await seed('Médio', '2026-01-03T03:30:00Z', 6000);
    await seed('Médio', '2026-01-04T03:30:00Z', 8000);
    await seed('Médio', '2026-01-04T03:30:00Z', 10000, 'contested');
    await seed('Superior', '2026-01-04T03:30:00Z', 10000);
    await page.goto('/evolucao');
    await expect(
      page.getByRole('heading', { name: 'Evolução', exact: true }).first(),
    ).toBeVisible();
    const topicResults = page.getByRole('region', {
      name: 'Desempenho por tema',
    });
    await expect(
      topicResults.getByText('66,7%', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Em desenvolvimento')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Praticar este tema' }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: /Aproveitamento ao longo do tempo/ }),
    ).toBeVisible();
    await expect(page.getByRole('table')).not.toBeVisible();
    await page.getByText('Ver dados do gráfico', { exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Superior');
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        `Evolução com dados a ${width}px`,
      ).toBeLessThanOrEqual(1);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
        `Axe na evolução com dados a ${width}px`,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`evolucao-dados-${width}.png`),
        fullPage: true,
      });
    }
    await page.getByText('Filtrar resultados', { exact: true }).click();
    await page.getByLabel('Nível', { exact: true }).fill('Médio');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/level=M%C3%A9dio/);
    await expect(
      page
        .getByRole('region', { name: 'Desempenho por tema' })
        .getByRole('article')
        .filter({
          has: page.getByRole('heading', { name: 'História', exact: true }),
        }),
    ).toHaveCount(1);
    await expect(
      topicResults.getByText('66,7%', { exact: true }),
    ).toBeVisible();
    await page.getByText('Ver dados do gráfico', { exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table')).toContainText('Médio');
    await expect(page.getByRole('table')).not.toContainText('Superior');
    await page
      .locator('.insights-filters input[type="date"]')
      .nth(0)
      .fill('2026-01-02');
    await page
      .locator('.insights-filters input[type="date"]')
      .nth(1)
      .fill('2026-01-03');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.getByText('Dados insuficientes')).toBeVisible();
    await expect(topicResults.getByText('60%', { exact: true })).toBeVisible();
    await page.getByLabel('Nível', { exact: true }).fill('Sem resultados');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Ainda não há resultados neste filtro',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Ainda não há resultados para mostrar no gráfico.'),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /Aproveitamento/ })).toHaveCount(
      0,
    );
  } finally {
    for (const table of [
      'recommendation',
      'grade_current',
      'grade_revision',
      'answer',
      'attempt',
      'question',
      'exam',
      'topic',
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE owner_id=$1`, [student]);
    }
    await pool.query('DELETE FROM session WHERE student_id=$1', [student]);
    await pool.query('DELETE FROM student WHERE id=$1', [student]);
    await pool.end();
  }
});
