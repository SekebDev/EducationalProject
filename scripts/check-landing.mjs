/* global process, document, window, console, getComputedStyle, URL */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const baseUrl = process.env.LANDING_URL ?? 'http://127.0.0.1:3147/';
const cases = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 800 },
];

try {
  for (const size of cases.slice(0, 2)) {
    const context = await browser.newContext({
      viewport: size,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    for (const progress of [0, 0.5, 0.96]) {
      await page.evaluate((value) => {
        const scene = document.getElementById('transformacao');
        if (!scene) {
          throw new Error('Scroll scene missing');
        }
        const top = scene.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(
          0,
          top + value * (scene.offsetHeight - window.innerHeight),
        );
      }, progress);
      await page.waitForTimeout(300);
      const frame = await page.evaluate(() => {
        const stage = document.querySelector('[data-scroll-stage]');
        const paper = document.querySelector(
          '[data-study-paper="questionPaper"]',
        );
        return {
          stickyTop: Math.round(stage?.getBoundingClientRect().top ?? -1),
          background: stage ? getComputedStyle(stage).backgroundColor : '',
          paperTransform: paper ? getComputedStyle(paper).transform : '',
          paperTransforms: [
            ...document.querySelectorAll('[data-study-paper]'),
          ].map((element) => getComputedStyle(element).transform),
          introOpacity: getComputedStyle(
            document.querySelector('[data-chaos-intro]'),
          ).opacity,
          imageOpacity: getComputedStyle(
            document.querySelector('[data-chaos-background]'),
          ).opacity,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      assert.equal(frame.overflow, false, `${size.name}: horizontal overflow`);
      assert.equal(frame.stickyTop, 0, `${size.name}: stage must stay pinned`);
      if (progress === 0.96) {
        assert.equal(frame.introOpacity, '0');
        assert.equal(frame.imageOpacity, '0');
        assert.match(frame.paperTransform, /^matrix\(1, 0, 0, 1,/);
        for (const transform of frame.paperTransforms) {
          assert.match(transform, /^matrix\(1, 0, 0, 1,/);
        }
      }
      await page.screenshot({
        path: `test-results/landing-scroll-${size.name}-${progress}.png`,
      });
      console.log(JSON.stringify({ viewport: size.name, progress, ...frame }));
      if (progress === 0 || progress === 0.5) {
        const scan = await new AxeBuilder({ page }).analyze();
        console.log(
          JSON.stringify({
            viewport: size.name,
            progress,
            axeViolations: scan.violations.map(({ id, impact }) => ({
              id,
              impact,
            })),
          }),
        );
        assert.equal(
          scan.violations.length,
          0,
          `${size.name}: accessibility at ${progress}`,
        );
      }
    }
    const axe = await new AxeBuilder({ page }).analyze();
    assert.equal(
      axe.violations.length,
      0,
      `${size.name}: final scene accessibility`,
    );
    console.log(
      JSON.stringify({
        viewport: size.name,
        finalScrollAxe: axe.violations.map(({ id, impact }) => ({
          id,
          impact,
        })),
      }),
    );
    await context.close();
  }
  for (const size of cases) {
    const context = await browser.newContext({
      viewport: size,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => ({
      title: document.title,
      heading: document.querySelector('[data-final-copy] h2')?.textContent,
      heroLines: (() => {
        const heading = document.querySelector('[data-final-copy] h2');
        if (!heading) {
          return 0;
        }
        return Math.round(
          heading.getBoundingClientRect().height /
            parseFloat(getComputedStyle(heading).lineHeight),
        );
      })(),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      ctas: [...document.querySelectorAll('a')]
        .filter((link) => link.textContent?.includes('Começar meu Caderno'))
        .map((link) => link.getAttribute('href')),
    }));
    await page.screenshot({
      path: `test-results/landing-${size.name}.png`,
      fullPage: true,
    });
    if (size.name !== 'mobile-360') {
      const sections = await page.locator('main > section').all();
      for (let index = 1; index < sections.length; index++) {
        await sections[index].screenshot({
          path: `test-results/landing-section-${size.name}-${index}.png`,
        });
      }
    }
    const axe = await new AxeBuilder({ page }).analyze();
    assert.equal(
      result.overflow,
      false,
      `${size.name}: reduced motion overflow`,
    );
    assert.equal(result.reducedMotion, true);
    assert.deepEqual(result.ctas, ['/cadastro', '/cadastro', '/cadastro']);
    assert.equal(
      axe.violations.length,
      0,
      `${size.name}: reduced motion accessibility`,
    );
    console.log(
      JSON.stringify({
        viewport: size.name,
        ...result,
        axeViolations: axe.violations.map(({ id, impact }) => ({ id, impact })),
      }),
    );
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => document.activeElement?.textContent);
  assert.equal(focus?.trim(), 'Ir para o conteúdo');
  console.log(JSON.stringify({ firstKeyboardFocus: focus?.trim() }));
  const cta = page.getByRole('link', { name: 'Começar meu Caderno' }).first();
  await cta.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/cadastro');
  console.log(
    JSON.stringify({ keyboardCtaDestination: new URL(page.url()).pathname }),
  );
  await context.close();
} finally {
  await browser.close();
}
