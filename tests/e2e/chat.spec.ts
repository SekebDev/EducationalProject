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

test('mostra Markdown, código e diagrama sem executar conteúdo da resposta', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/cadastro');
  const email = `markdown-${crypto.randomUUID()}@example.invalid`;
  createdEmails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  const conversationId = page.url().split('/').at(-1);
  const owner = (await (
    await page.context().request.get('/api/v1/auth/me')
  ).json()) as { id: string };
  createdStudentIds.push(owner.id);
  const code = 'const energia = "luz";\nconsole.log(energia);';
  const markdown = [
    '# Como uma planta usa luz',
    '',
    'A **fotossíntese** transforma luz em energia. Use `energia` no exemplo.',
    '',
    '1. A luz chega à planta.',
    '2. A clorofila participa da transformação.',
    '',
    '| Etapa | Resultado |',
    '| --- | --- |',
    '| Luz | Energia |',
    '',
    '> A clorofila participa desse processo.',
    '',
    '```typescript',
    code,
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    '  A[Luz] --> B[Clorofila]',
    '  B --> C[Energia]',
    '```',
    '',
    '[Link inseguro](javascript:alert(1))',
    '',
    '<script>window.markdownInjected = true</script>',
    '<img src="invalid" onerror="window.markdownInjected = true" />',
  ].join('\n');
  const pool = createPool(process.env.TEST_DATABASE_URL ?? '');
  try {
    const turnId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot)
       VALUES ($1,$2,1,'user','Explique com um diagrama','completed',$3,'acolhedora'),
              ($1,$2,2,'assistant',$4,'completed',$3,'acolhedora')`,
      [owner.id, conversationId, turnId, markdown],
    );
  } finally {
    await pool.end();
  }
  await page.reload();
  const answer = page.locator('article.message.assistant');
  await expect(
    answer.getByRole('heading', { name: 'Como uma planta usa luz' }),
  ).toBeVisible();
  await expect(answer.locator('strong')).toContainText('fotossíntese');
  await expect(answer.getByRole('table')).toContainText('Etapa');
  await expect(answer.locator('ol li')).toHaveCount(2);
  await expect(answer.locator('blockquote')).toContainText('A clorofila');
  await expect(
    answer.locator('pre code').filter({ hasText: 'console.log' }),
  ).toHaveText(code);
  const diagram = answer.getByRole('img', { name: 'Diagrama Mermaid' });
  await expect(diagram).toBeVisible({ timeout: 30_000 });
  const diagramSource = await diagram.getAttribute('src');
  expect(decodeURIComponent(diagramSource ?? '')).toContain('Clorofila');
  await answer
    .getByRole('button', { name: 'Copiar código', exact: true })
    .first()
    .click();
  await expect(answer.getByText('Copiado', { exact: true })).toBeVisible();
  const copiedCode = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedCode.replace(/\r\n/g, '\n')).toBe(code);
  await expect(
    answer.locator('script,img:not([alt="Diagrama Mermaid"])'),
  ).toHaveCount(0);
  await expect(answer.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => 'markdownInjected' in window)).toBe(false);
  await page.screenshot({
    path: test.info().outputPath('chat-markdown-1440.png'),
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByLabel('Sua pergunta')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath('chat-markdown-360.png'),
  });
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
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('radio', { name: /Acolhedora/ }).check();
  await page.getByLabel(/Dê um nome à conversa/).fill('Estudo de biologia');
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
  const teacherMenu = page.getByRole('button', {
    name: /^Estilo do professor:/,
  });
  await teacherMenu.focus();
  await page.keyboard.press('Enter');
  const socraticStyle = page.getByRole('menuitemradio', { name: /Socrática/ });
  await socraticStyle.focus();
  await page.keyboard.press('Enter');
  await expect(teacherMenu).toContainText('Socrática');
  await question.fill('Qual é a função da clorofila?');
  await page.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(page.getByText(/Qual é a função da clorofila\?/)).toBeVisible();
  await expect(page.locator('article.message.assistant')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('article.message.assistant')).toHaveCount(2);
  await expect(teacherMenu).toContainText('Socrática');
  const composer = await question.boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(780);
  await page.screenshot({ path: test.info().outputPath('chat-360.png') });
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('complementary', { name: 'Arquivos da conversa' }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('chat-1440.png') });

  const other = await browser.newPage({
    viewport: { width: 360, height: 780 },
  });
  try {
    await other.goto('/cadastro');
    const strangerEmail = `other-${crypto.randomUUID()}@example.invalid`;
    createdEmails.push(strangerEmail);
    await other.getByLabel('E-mail').fill(strangerEmail);
    await other
      .getByLabel('Senha', { exact: true })
      .fill('valid-password-1234');
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

test('persiste método e profundidade por teclado e revela flashcards sem perder Markdown', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/cadastro');
  const email = `skills-${crypto.randomUUID()}@example.invalid`;
  createdEmails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  const conversationId = page.url().split('/').at(-1)!;
  const owner = (await (
    await page.context().request.get('/api/v1/auth/me')
  ).json()) as { id: string };
  createdStudentIds.push(owner.id);
  const skillMenu = page.getByRole('button', { name: /^Método de estudo:/ });
  const depthMenu = page.getByRole('button', { name: /^Profundidade:/ });
  const teacherMenu = page.getByRole('button', {
    name: /^Estilo do professor:/,
  });
  await expect(skillMenu).toContainText('Explicar passo a passo');
  await expect(depthMenu).toContainText('Aprofundada');
  await skillMenu.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText(
      'Resolva uma etapa por vez, com pistas e feedback sobre sua tentativa.',
    ),
  ).toBeVisible();
  await page.getByRole('menuitemradio', { name: /Prática guiada/ }).focus();
  await page.keyboard.press('Enter');
  await expect(skillMenu).toContainText('Prática guiada');
  await expect(skillMenu).toBeEnabled();
  await depthMenu.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitemradio', { name: /^Resumida/ }).focus();
  await page.keyboard.press('Enter');
  await expect(depthMenu).toContainText('Resumida');
  await page.reload();
  await expect(skillMenu).toContainText('Prática guiada');
  await expect(depthMenu).toContainText('Resumida');
  await expect(teacherMenu).toContainText('Acolhedora');

  let releaseUpdate!: () => void;
  const updateGate = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  await page.route(
    `**/api/v1/conversations/${conversationId}`,
    async (route) => {
      if (route.request().method() === 'PATCH') {
        await updateGate;
      }
      await route.continue();
    },
  );
  try {
    await skillMenu.click();
    await page.getByRole('menuitemradio', { name: /^Flashcards/ }).click();
    await expect(skillMenu).toBeDisabled();
    await expect(depthMenu).toBeDisabled();
    await expect(teacherMenu).toBeDisabled();
  } finally {
    releaseUpdate();
  }
  await expect(skillMenu).toContainText('Flashcards');
  await expect(skillMenu).toBeEnabled();
  await page.unroute(`**/api/v1/conversations/${conversationId}`);
  await depthMenu.click();
  await page.getByRole('menuitemradio', { name: /^Equilibrada/ }).click();
  await expect(depthMenu).toContainText('Equilibrada');
  await expect(depthMenu).toBeEnabled();

  const deck = [
    'Recupere da memória antes de revelar.',
    '',
    '### Cartão 1',
    '',
    'Frente: O que a **clorofila** absorve?',
    '',
    'Verso: A luz solar. Ela participa da conversão de energia.',
    '',
    '[Link inseguro](javascript:alert(1))',
    '<script>window.flashcardInjected = true</script>',
    '',
    '### Cartão 2',
    '',
    'Frente: Qual gás a planta usa na fotossíntese?',
    '',
    'Verso: Dióxido de carbono.',
  ].join('\n');
  const malformed =
    '### Cartão 3\n\nFrente: Pergunta sem verso.\n\nEste conteúdo deve continuar visível.';
  const fenced =
    '```text\n### Cartão 4\n\nFrente: Exemplo de formato\n\nVerso: Isto é código, não um cartão.\n```';
  const pool = createPool(process.env.TEST_DATABASE_URL ?? '');
  try {
    for (const [index, answer] of [deck, malformed, fenced].entries()) {
      const turnId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot,skill_snapshot,response_depth_snapshot)
         VALUES ($1,$2,$3,'user','Crie cartões','completed',$4,'acolhedora','flashcards','equilibrada'),
                ($1,$2,$5,'assistant',$6,'completed',$4,'acolhedora','flashcards','equilibrada')`,
        [
          owner.id,
          conversationId,
          index * 2 + 1,
          turnId,
          index * 2 + 2,
          answer,
        ],
      );
    }
  } finally {
    await pool.end();
  }
  await page.reload();
  await expect(skillMenu).toContainText('Flashcards');
  await expect(depthMenu).toContainText('Equilibrada');
  const answers = page.locator('article.message.assistant');
  const firstAnswer = answers.nth(0);
  await expect(firstAnswer.getByText('Flashcards · Equilibrada')).toBeVisible();
  await expect(
    firstAnswer.getByText('clorofila', { exact: true }),
  ).toBeVisible();
  const firstCard = firstAnswer.getByRole('region', {
    name: 'Cartão 1',
    exact: true,
  });
  const firstBack = firstCard.getByText('A luz solar.', { exact: false });
  await expect(firstBack).toBeHidden();
  const reveal = firstCard.locator('summary');
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(firstBack).toBeVisible();
  await expect(firstCard.locator('details')).toHaveAttribute('open', '');
  await expect(firstCard.locator('script,a[href^="javascript:"]')).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => 'flashcardInjected' in window)).toBe(false);
  await expect(firstAnswer.getByText('Dióxido de carbono.')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(firstBack).toBeHidden();
  await expect(
    answers.nth(1).getByText('Este conteúdo deve continuar visível.'),
  ).toBeVisible();
  await expect(answers.nth(1).locator('details')).toHaveCount(0);
  await expect(answers.nth(2).locator('pre')).toContainText(
    'Isto é código, não um cartão.',
  );
  await expect(answers.nth(2).locator('details')).toHaveCount(0);

  await skillMenu.click();
  await page
    .getByRole('menuitemradio', { name: /^Explicar passo a passo/ })
    .click();
  await expect(skillMenu).toContainText('Explicar passo a passo');
  await page.reload();
  await expect(skillMenu).toContainText('Explicar passo a passo');
  await expect(firstAnswer.getByText('Flashcards · Equilibrada')).toBeVisible();
  await expect(firstBack).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath('chat-skills-360.png'),
  });
});
