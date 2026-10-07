/* global process, document, window, console */
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const url = process.env.LANDING_URL ?? 'http://127.0.0.1:3147/';
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    const chat = page.locator('[data-chat-demo]');
    await chat.scrollIntoViewIfNeeded();
    await expect(chat.locator('[data-demo-answer]')).toHaveCount(1);
    await expect(chat.getByRole('log')).toContainText('pequena cozinha');
    const firstAnswer = await chat.locator('[data-demo-answer]').boundingBox();
    const readingArea = await chat.getByRole('log').boundingBox();
    assert.ok(
      firstAnswer.y + firstAnswer.height <=
        readingArea.y + readingArea.height + 1,
      'A primeira resposta deve caber inteira na área de leitura',
    );
    await page.locator('#como-funciona').screenshot({
      path: `test-results/chat-desktop-mobile-${viewport.width}.png`,
    });
    for (const [name, fragment] of [
      ['Objetiva', 'clorofila absorve'],
      ['Socrática', 'Sem essa energia'],
      ['Acolhedora', 'pequena cozinha'],
    ]) {
      const button = chat.getByRole('button', { name, exact: true });
      await button.focus();
      await button.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(chat.getByRole('log')).toContainText(fragment);
      await expect(chat.locator('[data-demo-answer]')).toHaveCount(1);
    }
    await chat.getByRole('button', { name: /Continuar o exemplo/ }).click();
    await expect(chat.locator('[data-demo-answer]')).toHaveCount(2);
    await chat.getByRole('button', { name: /Continuar o exemplo/ }).click();
    await expect(chat.locator('[data-demo-answer]')).toHaveCount(3);
    await expect(chat.getByRole('log')).toContainText('Ele vem da água.');
    await chat.getByRole('button', { name: /Recomeçar esta conversa/ }).click();
    await expect(chat.locator('[data-demo-answer]')).toHaveCount(1);
    await chat.getByRole('button', { name: 'Socrática', exact: true }).click();
    await chat.getByRole('button', { name: 'Objetiva', exact: true }).click();
    await expect(chat.getByRole('log')).toContainText('clorofila absorve');
    await expect(chat.getByRole('log')).not.toContainText('Sem essa energia');
    await chat
      .getByRole('button', { name: 'Recomeçar exemplo', exact: true })
      .click();
    await expect(chat.locator('[data-demo-answer]')).toHaveCount(1);
    const axe = await new AxeBuilder({ page })
      .include('#como-funciona')
      .analyze();
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        viewport,
        personalities: 3,
        conversationTurns: 3,
        restart: true,
        rapidSwitch: true,
        keyboard: true,
        axe: [],
        overflow,
      }),
    );
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const chat = page.locator('[data-chat-demo]');
  await chat.scrollIntoViewIfNeeded();
  await expect(chat.locator('[data-demo-answer]')).toHaveCount(1);
  await chat.getByRole('button', { name: 'Socrática', exact: true }).click();
  await expect(chat.getByRole('log')).toContainText('Sem essa energia');
  console.log(JSON.stringify({ reducedMotion: true, interactive: true }));
  await context.close();
} finally {
  await browser.close();
}
