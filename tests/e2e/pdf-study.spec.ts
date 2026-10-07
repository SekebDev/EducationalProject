import { createRequire } from 'node:module';
import { readFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PdfStudy } from '../../packages/contracts/src/index';
import { createPool } from '../../apps/api/src/infrastructure/db/pool';

const apiRequire = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
const { PDFDocument, StandardFonts, degrees } = apiRequire(
  'pdf-lib',
) as typeof import('../../apps/api/node_modules/pdf-lib');
const emails: string[] = [];

async function teacherPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([595, 842]);
  first.drawText('Aula do professor: conceito inicial.', {
    x: 60,
    y: 720,
    size: 16,
    font,
  });
  first.drawText('Uma segunda linha para estudar com calma.', {
    x: 60,
    y: 675,
    size: 16,
    font,
  });
  const second = pdf.addPage([640, 850]);
  second.setCropBox(20, 30, 590, 800);
  second.setRotation(degrees(90));
  second.drawText('Aula do professor: segunda pagina.', {
    x: 60,
    y: 690,
    size: 16,
    font,
  });
  return Buffer.from(await pdf.save());
}

async function register(page: Page) {
  await page.goto('/cadastro');
  const email = `pdf-study-${crypto.randomUUID()}@example.invalid`;
  emails.push(email);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('valid-password-1234');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/conversas$/);
}

async function savedStudy(page: Page, materialId: string): Promise<PdfStudy> {
  const response = await page
    .context()
    .request.get(`/api/v1/materials/${materialId}/study`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<PdfStudy>;
}

async function saveNote(page: Page, text: string, waitForSave = true, y = 190) {
  await page
    .getByRole('button', { name: 'Escrever nota', exact: true })
    .click();
  await page
    .locator('svg[aria-label="Anotações da página"]')
    .click({ position: { x: 160, y } });
  const dialog = page.getByRole('dialog', { name: 'Nota de estudo' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Escreva sua anotação').fill(text);
  await dialog
    .getByRole('button', { name: 'Salvar nota', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  if (waitForSave) {
    await expect(
      page.getByRole('status').filter({ hasText: /^Salvo$/ }),
    ).toBeVisible();
  }
  await expect(
    page.locator('svg[aria-label="Anotações da página"]'),
  ).toContainText(text);
}

test('PDF do professor, notas persistidas, páginas de estudo, tutor e exportação completa', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await register(page);
  await page.goto('/conversas/nova');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+$/);
  await expect(page.getByLabel('Adicionar material')).toBeEnabled();
  await page.getByLabel('Adicionar material').setInputFiles({
    name: 'aula-professor.pdf',
    mimeType: 'application/pdf',
    buffer: await teacherPdf(),
  });
  await page
    .getByRole('button', { name: 'Enviar arquivo', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Estudar aula-professor.pdf', exact: true })
    .click();
  await expect(page).toHaveURL(/\/conversas\/[a-f0-9-]+\?pdf=[a-f0-9-]+$/);
  const materialId = new URL(page.url()).searchParams.get('pdf')!;
  await expect(page.locator('#question')).toHaveCount(1);
  await expect(page.locator('#pdf-tutor-question')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Área de estudo do PDF' }),
  ).toBeVisible();
  await expect(page.getByLabel('Página original do professor')).toBeVisible();
  await expect(
    page.getByText('Aula do professor: conceito inicial.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Carregando página…', { exact: true }),
  ).not.toBeVisible();
  expect((await savedStudy(page, materialId)).state.pages).toHaveLength(2);

  await saveNote(page, 'Revisão com atenção.');
  let initial = await savedStudy(page, materialId);
  expect(
    initial.state.annotations.map((annotation) => annotation.text),
  ).toContain('Revisão com atenção.');
  await page.reload();
  await expect(
    page.locator('svg[aria-label="Anotações da página"]'),
  ).toContainText('Revisão com atenção.');
  expect(
    (await savedStudy(page, materialId)).state.pages.map((item) => item.id),
  ).toEqual(initial.state.pages.map((item) => item.id));

  // Failed writes must survive in IndexedDB and replay after reopening.
  await page.route('**/api/v1/materials/*/study', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await saveNote(page, 'Rascunho recuperado.', false, 290);
  await expect(
    page.getByRole('status').filter({ hasText: /^Pendente$/ }),
  ).toBeVisible();
  await page.unroute('**/api/v1/materials/*/study');
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: /^Salvo$/ }),
  ).toBeVisible();
  await expect(
    page.locator('svg[aria-label="Anotações da página"]'),
  ).toContainText('Rascunho recuperado.');
  initial = await savedStudy(page, materialId);
  expect(
    initial.state.annotations.map((annotation) => annotation.text),
  ).toContain('Rascunho recuperado.');

  await page
    .getByRole('button', { name: 'Aumentar zoom', exact: true })
    .click();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveText('90%');
  await page
    .getByRole('button', { name: 'Girar visualização', exact: true })
    .click();
  await expect(
    page.getByText('Carregando página…', { exact: true }),
  ).not.toBeVisible();
  expect((await savedStudy(page, materialId)).state.annotations).toEqual(
    initial.state.annotations,
  );
  await page
    .getByRole('button', { name: 'Girar visualização', exact: true })
    .click({ clickCount: 3 });

  await page
    .getByRole('button', { name: 'Página de estudo', exact: true })
    .click();
  await expect(
    page.getByText('Minhas anotações · Após a página 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /^Salvo$/ }),
  ).toBeVisible();
  expect((await savedStudy(page, materialId)).state.pages).toHaveLength(3);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect
    .poll(async () => (await savedStudy(page, materialId)).state.pages.length)
    .toBe(2);
  await expect(
    page.getByRole('button', { name: 'Refazer', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect
    .poll(async () => (await savedStudy(page, materialId)).state.pages.length)
    .toBe(3);
  await page.getByRole('button', { name: 'Páginas', exact: true }).click();
  const pages = page.getByRole('navigation', { name: 'Páginas do caderno' });
  await pages
    .getByRole('button')
    .filter({ hasText: 'Minhas anotações' })
    .click();
  await saveNote(page, 'Resumo da minha aula.');

  await pages.getByRole('button').filter({ hasText: 'Página 1' }).click();
  await expect(
    page.getByText('Aula do professor: conceito inicial.', { exact: true }),
  ).toBeVisible();
  await page.locator('#question').fill('Explique o conceito desta página.');
  await page
    .getByRole('button', { name: 'Enviar pergunta', exact: true })
    .click();
  await expect(
    page
      .locator('.message.assistant')
      .filter({ hasText: 'Modo de demonstração' }),
  ).toContainText('Modo de demonstração');
  await expect
    .poll(async () => (await savedStudy(page, materialId)).turns.length)
    .toBe(2);
  const explained = await savedStudy(page, materialId);
  expect(explained.state.pages).toHaveLength(3);
  const lesson = explained.state.lessons?.find(
    (item) => item.id === explained.state.activeLessonId,
  );
  expect(lesson?.steps).toHaveLength(2);
  expect(lesson?.currentStepIndex).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Entendi', exact: true }),
  ).toBeVisible();
  expect(explained.turns[1]!.basis).toBe('unsupported');
  await page.reload();
  await expect(
    page
      .locator('.message.assistant')
      .filter({ hasText: 'Modo de demonstração' }),
  ).toContainText('Modo de demonstração');
  expect((await savedStudy(page, materialId)).revision).toBe(
    explained.revision,
  );
  expect(
    (await savedStudy(page, materialId)).state.lessons?.[0]?.currentStepIndex,
  ).toBe(0);
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedStudy(page, materialId)).state.lessons?.[0]
          ?.currentStepIndex,
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Entendi', exact: true }),
  ).toBeVisible();
  expect(
    (await savedStudy(page, materialId)).state.lessons?.[0]?.currentStepIndex,
  ).toBe(1);
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedStudy(page, materialId)).state.lessons?.[0]?.completed,
    )
    .toBe(true);
  await expect(
    page.getByRole('button', {
      name: 'Abrir PDF desta explicação',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar PDF', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]pdf=/);
  await expect(page.locator('#question')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Abrir PDF desta explicação', exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]pdf=/);
  await expect(page.locator('#pdf-tutor-question')).toHaveCount(0);
  await expect(
    page.getByText('Aula do professor: conceito inicial.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Carregando página…', { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('caderno-pdf-persistido.png'),
    fullPage: true,
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('aula-professor-estudo.pdf');
  const exportedPath = test.info().outputPath('aula-professor-estudo.pdf');
  await download.saveAs(exportedPath);
  const exported = await readFile(exportedPath);
  const exportedPdf = await PDFDocument.load(exported);
  expect(exportedPdf.getPageCount()).toBe(3);
  expect(exportedPdf.getPage(2).getRotation().angle).toBe(90);
  expect(exportedPdf.getPage(2).getCropBox()).toEqual({
    x: 20,
    y: 30,
    width: 590,
    height: 800,
  });
  const pdfjsPath = apiRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = (await import(
    pathToFileURL(pdfjsPath).href
  )) as typeof import('../../apps/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(exported),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    const text: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      text.push(
        (await (await document.getPage(index)).getTextContent()).items
          .flatMap((item) => ('str' in item ? [item.str] : []))
          .join(' '),
      );
    }
    const combined = text.join(' ');
    for (const expected of [
      'Aula do professor: conceito inicial.',
      'Revisão com atenção.',
      'Rascunho recuperado.',
      'Resumo da minha aula.',
      'Aula do professor: segunda pagina.',
    ]) {
      expect(combined).toContain(expected);
    }
  } finally {
    await task.destroy();
  }
  const desktopAccessibility = await new AxeBuilder({ page })
    .include('[aria-label="Área de estudo do PDF"]')
    .analyze();
  expect(desktopAccessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Área de estudo do PDF' }),
  ).toBeVisible();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveText('45%');
  await expect(
    page.getByText('Aula do professor: conceito inicial.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Carregando página…', { exact: true }),
  ).not.toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const mobileAccessibility = await new AxeBuilder({ page })
    .include('[aria-label="Área de estudo do PDF"]')
    .analyze();
  expect(mobileAccessibility.violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('caderno-pdf-mobile.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test.afterEach(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL obrigatório');
  }
  const pool = createPool(databaseUrl);
  try {
    const ids = (
      await pool.query<{ id: string }>(
        'SELECT id FROM student WHERE email=ANY($1::text[])',
        [emails],
      )
    ).rows.map((row) => row.id);
    const materials = (
      await pool.query<{ id: string; owner_id: string }>(
        'SELECT id,owner_id FROM material WHERE owner_id=ANY($1::uuid[])',
        [ids],
      )
    ).rows;
    for (const table of [
      'material_chunk',
      'conversation_source',
      'operation_event',
      'operation',
      'idempotency_record',
      'message',
      'material',
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
    for (const material of materials) {
      // e2e-api runs from apps/api; files are jailed to that test-only storage.
      const storage = resolve('apps/api/.local-storage-e2e');
      const path = resolve(storage, material.owner_id, material.id);
      if (relative(storage, path).startsWith('..')) {
        throw new Error('Unsafe test storage cleanup');
      }
      await rm(path, { force: true });
    }
  } finally {
    emails.length = 0;
    await pool.end();
  }
});
