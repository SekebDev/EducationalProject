import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readConfig } from '../../apps/api/src/infrastructure/config.js';
import { loadLocalEnv } from '../../apps/api/src/infrastructure/load-env.js';
import { OpenAiProvider } from '../../apps/api/src/infrastructure/ai/provider.js';
import { runBudgetAccounting } from '../../apps/api/src/infrastructure/ai/run-budget.js';
import { validateChatCitations } from '../../apps/api/src/modules/conversations/sources.service.js';
import { validateGrade } from '../../apps/api/src/modules/grading/grade.job.js';
import { EvaluationBudget } from './accounting.js';
import { evaluationSamples } from './samples.js';

loadLocalEnv();
const samples = evaluationSamples();
const dryRun = process.argv.includes('--dry-run');
if (!dryRun && process.env.EVALUATION_REAL_ACK !== '1') {
  throw new Error(
    'EVALUATION_REAL_ACK=1 obrigatório; use --dry-run para inspecionar sem custo.',
  );
}
const prices = {
  model: process.env.EVALUATION_MODEL ?? '',
  inputPerMillion: Number(process.env.EVALUATION_INPUT_USD_PER_MILLION),
  outputPerMillion: Number(process.env.EVALUATION_OUTPUT_USD_PER_MILLION),
};
const accounting = dryRun
  ? null
  : new EvaluationBudget(Number(process.env.EVALUATION_MAX_USD), prices);
if (!dryRun && !process.env.EVALUATION_PRICE_SOURCE?.trim()) {
  throw new Error(
    'EVALUATION_PRICE_SOURCE obrigatório para registrar a origem/data dos preços.',
  );
}
const directory = resolve(
  'test-results/evaluations',
  new Date().toISOString().replaceAll(':', '-') + (dryRun ? '-dry' : '-real'),
);
await mkdir(directory, { recursive: true });
const metadata = {
  generatedAt: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'real-provider',
  sampleCount: samples.length,
  prices: dryRun ? null : prices,
  priceSource: process.env.EVALUATION_PRICE_SOURCE ?? null,
  maxUsd: accounting?.maxUsd ?? 0,
  scope:
    'Provider/prompt/schema com trechos sintéticos; não mede upload, recuperação vetorial ou carga HTTP.',
  status: 'awaiting_human_review',
};
await writeFile(
  resolve(directory, 'metadata.json'),
  JSON.stringify(metadata, null, 2),
);
if (dryRun) {
  await writeFile(
    resolve(directory, 'samples.json'),
    JSON.stringify(samples, null, 2),
  );
  process.stdout.write(
    `Dry run: 30 fontes + 30 discursivas, sem chamadas. ${directory}\n`,
  );
} else {
  process.env.OPENAI_CHAT_MODEL = prices.model;
  process.env.OPENAI_GRADING_MODEL = prices.model;
  const config = readConfig({ ...process.env, AI_PROVIDER: 'openai' });
  const ledger = runBudgetAccounting(config.databaseUrl);
  const provider = new OpenAiProvider(config, () => {
    const persistent = ledger?.();
    return {
      beforeRequest: async (input) => {
        accounting!.beforeRequest(input);
        await persistent?.beforeRequest(input);
      },
      receivedResponse: async (usage) => {
        accounting!.receivedResponse(usage);
        await persistent?.receivedResponse(usage);
      },
      requestFinished: async () => {
        accounting!.finishRequest();
        await persistent?.requestFinished?.();
      },
    };
  });
  let completed = 0;
  let failures = 0;
  try {
    for (const sample of samples) {
      accounting!.usage = null;
      const start = performance.now();
      const before = accounting!.spentUsd;
      let output: unknown = null;
      let aiPoints: number | null = null;
      let error: string | null = null;
      let locatorValidated: boolean | null = null;
      try {
        if (sample.kind === 'source') {
          output = await provider.chat(sample.input);
          validateChatCitations(
            output as Awaited<ReturnType<typeof provider.chat>>,
            sample.chunks,
          );
          locatorValidated = true;
        } else {
          const grade = await provider.grade(sample.input);
          output = grade;
          aiPoints =
            validateGrade(
              grade,
              sample.input.rubric.map((criterion) => ({
                ...criterion,
                description: criterion.label,
              })),
            ).pointsUnits / 10_000;
        }
        completed++;
      } catch (failure) {
        failures++;
        error =
          failure instanceof Error &&
          /^EVALUATION_[A-Z_]+$|^AI_[A-Z_]+$/u.test(failure.message)
            ? failure.message
            : 'EVALUATION_REQUEST_FAILED';
        if (
          error.startsWith('EVALUATION_') &&
          error !== 'EVALUATION_REQUEST_FAILED'
        ) {
          throw new Error(error);
        }
      } finally {
        accounting!.finishRequest();
        const row = {
          id: sample.id,
          kind: sample.kind,
          scenario: sample.scenario,
          latencyMs: Math.round(performance.now() - start),
          costUsd: accounting!.spentUsd - before,
          costBasis: accounting!.usage
            ? 'tokens_at_recorded_price_no_cache_discount'
            : 'reserved_upper_bound_usage_unknown',
          usage: accounting!.usage,
          input: sample.input,
          output,
          error,
          locatorValidated,
          chunks: sample.kind === 'source' ? sample.chunks : undefined,
          humanSupported: null,
          locatorExists: null,
          unsupportedExplicit: null,
          humanPoints: null,
          aiPoints,
          criteriaJustified: null,
        };
        await appendFile(
          resolve(directory, 'reviews.jsonl'),
          JSON.stringify(row) + '\n',
          { mode: 0o600 },
        );
      }
    }
  } finally {
    await writeFile(
      resolve(directory, 'summary.json'),
      JSON.stringify(
        {
          completed,
          failures,
          spentUpperBoundUsd: accounting!.spentUsd,
          status: 'awaiting_human_review',
          scope: metadata.scope,
        },
        null,
        2,
      ),
    );
  }
  process.stdout.write(
    `Coleta: ${completed} sucessos, ${failures} falhas. Revisão humana pendente em ${directory}\n`,
  );
  if (failures > 0) {
    process.exitCode = 1;
  }
}
