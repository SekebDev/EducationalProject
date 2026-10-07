import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { log } from 'node:console';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Pipe into node --input-type=module in the existing isolated staging API.
if (process.cwd() !== '/app/apps/api' || !process.env.AI_RUN_BUDGET_ID) {
  throw new Error('Execute no staging com o ledger existente.');
}
const { OpenAiProvider } = await import(
  pathToFileURL(resolve('dist/infrastructure/ai/provider.js'))
);
const { AiRunBudget } = await import(
  pathToFileURL(resolve('dist/infrastructure/ai/run-budget.js'))
);
const { readConfig } = await import(
  pathToFileURL(resolve('dist/infrastructure/config.js'))
);
const config = readConfig(process.env);
const budget = new AiRunBudget(config.databaseUrl, {
  id: process.env.AI_RUN_BUDGET_ID,
  maxUsd: Number(process.env.AI_RUN_BUDGET_USD),
  prices: JSON.parse(process.env.AI_RUN_PRICES_JSON),
});
const usage = [];
const provider = new OpenAiProvider(config, () => {
  const observer = budget.observer();
  return {
    beforeRequest: (input) => observer.beforeRequest(input),
    receivedResponse: async (input) => {
      usage.push(input);
      await observer.receivedResponse(input);
    },
    requestFinished: () => observer.requestFinished(),
  };
});
const cases = {
  'r-basic':
    'Pode me dar um resumo completo da linguagem R básica? Explique variáveis, tipos, vetores e indexação, listas, data.frames, condições, loops, funções, NA, importação de CSV e gráficos, com exemplos pequenos e explicados. Inclua erros comuns e uma atividade para conferir a compreensão.',
  derivatives:
    'Explique derivadas para quem conhece funções, mas nunca estudou cálculo. Desenvolva a intuição, o significado da inclinação, a definição por limite e um exemplo completo com f(x)=x². Explique as condições de aplicação, um erro comum e como conferir a compreensão.',
};
const caseName = process.env.STAGING_SMOKE_CASE ?? 'r-basic';
const question = cases[caseName];
if (!question) {
  throw new Error('Caso de smoke inválido.');
}
const report = {
  recordedAt: new Date().toISOString(),
  question,
  skill: 'explicar',
  responseDepth: 'aprofundada',
  usage,
};
try {
  report.response = await provider.chat({
    question,
    personality: 'acolhedora',
    skill: 'explicar',
    skillVersion: 1,
    responseDepth: 'aprofundada',
    sources: [],
    history: [],
  });
  const text = report.response.segments
    .map((segment) => segment.text)
    .join('\n\n');
  report.characters = text.length;
  report.words = text.trim().split(/\s+/u).length;
} catch (error) {
  report.error = error.code ?? error.message;
  process.exitCode = 1;
} finally {
  const row = (
    await budget.pool.query(
      'SELECT max_micro_usd,spent_micro_usd,reserved_micro_usd FROM ai_run_budget WHERE id=$1',
      [process.env.AI_RUN_BUDGET_ID],
    )
  ).rows[0];
  report.budget = row;
  await writeFile(
    `/app/test-results/${caseName}-luna-smoke.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  log(
    JSON.stringify(
      {
        error: report.error,
        model: usage[0]?.model,
        usage,
        characters: report.characters,
        words: report.words,
        segments: report.response?.segments.length,
        budget: row,
      },
      null,
      2,
    ),
  );
  await budget.pool.end();
}
