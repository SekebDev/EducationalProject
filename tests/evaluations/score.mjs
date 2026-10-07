/* global process */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const inputPath = process.argv[2];
const budget = Number(process.env.EVALUATION_MAX_USD);
const datasetLabel = process.env.EVALUATION_DATASET_LABEL?.trim();
if (!inputPath || !Number.isFinite(budget) || budget <= 0 || !datasetLabel) {
  throw new Error(
    'Informe JSONL de revisões, EVALUATION_MAX_USD positivo e EVALUATION_DATASET_LABEL.',
  );
}
const rows = (await readFile(inputPath, 'utf8'))
  .trim()
  .split(/\r?\n/u)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`JSON inválido na linha ${index + 1}.`);
    }
  });
const ids = new Set();
for (const [index, row] of rows.entries()) {
  if (
    !row ||
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    (row.error !== null && row.error !== undefined) ||
    ids.has(row.id) ||
    !['source', 'essay'].includes(row.kind) ||
    !Number.isFinite(row.latencyMs) ||
    row.latencyMs < 0 ||
    !Number.isFinite(row.costUsd) ||
    row.costUsd < 0
  ) {
    throw new Error(
      `Metadados inválidos ou ID duplicado na linha ${index + 1}.`,
    );
  }
  ids.add(row.id);
  if (row.kind === 'source') {
    if (
      typeof row.humanSupported !== 'boolean' ||
      typeof row.locatorExists !== 'boolean' ||
      typeof row.unsupportedExplicit !== 'boolean'
    ) {
      throw new Error(`Revisão de fonte incompleta na linha ${index + 1}.`);
    }
  } else if (
    !Number.isFinite(row.humanPoints) ||
    !Number.isFinite(row.aiPoints) ||
    row.humanPoints < 0 ||
    row.humanPoints > 1 ||
    row.aiPoints < 0 ||
    row.aiPoints > 1 ||
    typeof row.criteriaJustified !== 'boolean'
  ) {
    throw new Error(`Revisão discursiva incompleta na linha ${index + 1}.`);
  }
}
const sources = rows.filter((row) => row.kind === 'source');
const essays = rows.filter((row) => row.kind === 'essay');
if (sources.length < 30 || essays.length < 30) {
  throw new Error('SC-004/005 exigem ao menos 30 revisões de cada tipo.');
}
const spentUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
const supported = sources.filter((row) => row.humanSupported).length;
const badLocators = sources.filter((row) => !row.locatorExists).length;
const implicitUnsupported = sources.filter(
  (row) => !row.humanSupported && !row.unsupportedExplicit,
).length;
const closeGrades = essays.filter(
  (row) => Math.abs(row.humanPoints - row.aiPoints) <= 0.2 + Number.EPSILON,
).length;
const unjustified = essays.filter((row) => !row.criteriaJustified).length;
const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
const percentile = (fraction) =>
  latencies[Math.ceil(latencies.length * fraction) - 1] ?? null;
const report = {
  generatedAt: new Date().toISOString(),
  datasetLabel,
  sourceCount: sources.length,
  essayCount: essays.length,
  maxCostUsd: budget,
  spentUsd: Number(spentUsd.toFixed(6)),
  p50LatencyMs: percentile(0.5),
  p95LatencyMs: percentile(0.95),
  sourceSupportRate: supported / sources.length,
  nonexistentLocatorCount: badLocators,
  implicitUnsupportedCount: implicitUnsupported,
  essayAgreementRate: closeGrades / essays.length,
  unjustifiedEssayCount: unjustified,
  sc004Passed:
    supported / sources.length >= 0.9 &&
    badLocators === 0 &&
    implicitUnsupported === 0,
  sc005Passed: closeGrades / essays.length >= 0.9 && unjustified === 0,
  withinBudget: spentUsd <= budget,
};
await mkdir('test-results/evaluations', { recursive: true });
await writeFile(
  join('test-results/evaluations', 'scored-report.json'),
  JSON.stringify(report, null, 2),
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.sc004Passed || !report.sc005Passed || !report.withinBudget) {
  process.exitCode = 1;
}
