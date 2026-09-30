import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

const emails: string[] = [];

async function createConversation(page: Page) {
  await page.goto('/cadastro');
  const email = `material-drop-${crypto.randomUUID()}@example.invalid`;
  emails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  await expect(page.getByLabel('Sua pergunta')).toBeVisible();
  return page.url();
}

async function dropFiles(
  page: Page,
  files: Array<{ name: string; type: string; text?: string; size?: number }>,
) {
  const dataTransfer = await page.evaluateHandle((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      const content =
        item.size === undefined ? (item.text ?? '') : new Uint8Array(item.size);
      transfer.items.add(new File([content], item.name, { type: item.type }));
    }
    return transfer;
  }, files);
  try {
    const chat = page.getByRole('main', { name: 'Conversa', exact: true });
    await chat.dispatchEvent('dragenter', { dataTransfer });
    await chat.dispatchEvent('dragover', { dataTransfer });
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Solte para adicionar à conversa' }),
    ).toBeVisible();
    const prevented = await chat.evaluate((element, transfer) => {
      const event = new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, dataTransfer);
    expect(prevented).toBe(true);
  } finally {
    await dataTransfer.dispose();
  }
}

for (const width of [360, 1440]) {
  test(`arrastar Markdown abre arquivos e envia cada arquivo uma vez a ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    const conversationUrl = await createConversation(page);
    const uploads: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/conversations\/[^/]+\/materials$/u.test(
          new URL(request.url()).pathname,
        )
      ) {
        uploads.push(request.url());
      }
    });
    const panel = page.locator('.materials-panel');
    if (width === 1440) {
      await expect(panel).toBeVisible();
      await page
        .getByRole('button', { name: 'Materiais de apoio', exact: true })
        .click();
    }
    await expect(panel).not.toBeVisible();
    await dropFiles(page, [
      {
        name: 'fotossintese.md',
        type: 'text/markdown',
        text: '# Fotossíntese\nA planta usa luz para produzir matéria orgânica.',
      },
      {
        name: 'respiracao.markdown',
        type: 'text/plain',
        text: '# Respiração\nAs células obtêm energia a partir de nutrientes.',
      },
    ]);
    await expect(page).toHaveURL(conversationUrl);
    await expect(panel).toBeVisible();
    if (width === 360) {
      await expect(
        page.getByRole('dialog', { name: 'Materiais de apoio' }),
      ).toBeVisible();
    }
    await expect(
      panel.getByRole('checkbox', { name: 'fotossintese.md' }),
    ).toBeEnabled();
    await expect(
      panel.getByRole('checkbox', { name: 'respiracao.markdown' }),
    ).toBeEnabled();
    await expect(
      panel.getByRole('checkbox', { name: 'fotossintese.md' }),
    ).not.toBeChecked();
    await expect(
      panel.getByRole('checkbox', { name: 'respiracao.markdown' }),
    ).not.toBeChecked();
    await expect(panel.getByText('Pronto', { exact: true })).toHaveCount(2);
    expect(uploads).toHaveLength(2);
    await page.reload();
    await expect(page.getByLabel('Sua pergunta')).toBeVisible();
    if (!(await panel.isVisible())) {
      await page
        .getByRole('button', { name: 'Materiais de apoio', exact: true })
        .click();
    }
    await expect(
      panel.getByRole('checkbox', { name: 'fotossintese.md' }),
    ).toHaveCount(1);
    await expect(
      panel.getByRole('checkbox', { name: 'respiracao.markdown' }),
    ).toHaveCount(1);
    expect(uploads).toHaveLength(2);
    await expect(page).toHaveURL(conversationUrl);
  });
}

test('arrastar arquivo inválido, vazio ou acima de 20 MB não faz upload', async ({
  page,
}) => {
  const conversationUrl = await createConversation(page);
  let uploads = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/conversations\/[^/]+\/materials$/u.test(
        new URL(request.url()).pathname,
      )
    ) {
      uploads += 1;
    }
  });
  const panel = page.locator('.materials-panel');
  await dropFiles(page, [
    {
      name: 'programa.exe',
      type: 'application/octet-stream',
      text: 'arquivo não permitido',
    },
  ]);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('alert')).toContainText(
    'programa.exe: use PDF, DOCX, TXT ou Markdown (.md).',
  );
  expect(uploads).toBe(0);
  await dropFiles(page, [
    { name: 'vazio.md', type: 'text/markdown', text: '' },
  ]);
  await expect(panel.getByRole('alert')).toContainText(
    'vazio.md: o arquivo está vazio.',
  );
  expect(uploads).toBe(0);
  await dropFiles(page, [
    { name: 'grande.md', type: 'text/markdown', size: 20_000_001 },
  ]);
  await expect(panel.getByRole('alert')).toContainText(
    'grande.md: o limite é de 20 MB por arquivo.',
  );
  expect(uploads).toBe(0);
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  await expect(page).toHaveURL(conversationUrl);
});

test('arquivo arrastado com falha fica disponível para nova tentativa', async ({
  page,
}) => {
  const conversationUrl = await createConversation(page);
  let attempts = 0;
  const uploadKeys: string[] = [];
  await page.route('**/api/v1/conversations/*/materials', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    attempts += 1;
    uploadKeys.push(route.request().headers()['idempotency-key'] ?? '');
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'TEST_UPLOAD_UNAVAILABLE',
          message: 'Não foi possível enviar este arquivo agora.',
        }),
      });
      return;
    }
    await route.continue();
  });
  await dropFiles(page, [
    {
      name: 'tentar-novamente.md',
      type: 'text/markdown',
      text: '# Frações\nUma fração representa partes de um todo.',
    },
  ]);
  const panel = page.locator('.materials-panel');
  await expect(panel).toBeVisible();
  const retry = panel.getByRole('button', {
    name: 'Tentar enviar novamente',
    exact: true,
  });
  await expect(retry).toBeVisible();
  expect(attempts).toBe(1);
  await expect(
    panel.getByRole('checkbox', { name: 'tentar-novamente.md' }),
  ).toHaveCount(0);
  await retry.click();
  await expect(
    panel.getByRole('checkbox', { name: 'tentar-novamente.md' }),
  ).toBeEnabled();
  await expect(retry).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(uploadKeys).toHaveLength(2);
  expect(uploadKeys[0]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  expect(uploadKeys[1]).toBe(uploadKeys[0]);
  await expect(page).toHaveURL(conversationUrl);
});

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
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
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
  await expect(panel).not.toBeVisible();
  const filesTrigger = page.getByRole('button', {
    name: 'Materiais de apoio',
    exact: true,
  });
  await filesTrigger.click();
  await expect(panel).toBeVisible();
  await panel.locator('input[type=file]').setInputFiles({
    name: 'aula.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Anotações da aula\nFotossíntese usa luz.'),
  });
  await panel.getByRole('button', { name: 'Enviar arquivo' }).click();
  await expect(panel.getByText('Pronto')).toBeVisible();
  await panel.getByRole('checkbox', { name: 'aula.md' }).click();
  await expect(panel.getByRole('checkbox', { name: 'aula.md' })).toBeChecked();
  await page.screenshot({
    path: test.info().outputPath('chat-arquivos-360.png'),
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar' })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(filesTrigger).toBeFocused();
  await filesTrigger.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Materiais de apoio' }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Materiais de apoio' })
    .press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(filesTrigger).toBeFocused();
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
            name: 'aula.md',
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
  const sourceButton = page.getByRole('button', { name: 'aula.md, linha 2' });
  await sourceButton.click();
  const sourcePreview = page.getByRole('complementary', {
    name: 'Trecho da fonte',
  });
  await expect(sourcePreview).toContainText('Fotossíntese usa luz.');
  await expect(sourcePreview).toBeFocused();
  await sourcePreview.press('Escape');
  await expect(sourcePreview).toHaveCount(0);
  await expect(sourceButton).toBeFocused();

  const other = await browser.newPage();
  try {
    await other.goto('/cadastro');
    const otherEmail = `material-other-${crypto.randomUUID()}@example.invalid`;
    emails.push(otherEmail);
    await other.getByLabel('E-mail').fill(otherEmail);
    await other
      .getByLabel('Senha', { exact: true })
      .fill('valid-password-1234');
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

  await page
    .getByRole('button', { name: 'Materiais de apoio', exact: true })
    .click();
  await expect(panel).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'Excluir' }).click();
  await expect(panel.getByText('aula.md')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Fonte indisponível · aula.md')).toBeVisible();
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
