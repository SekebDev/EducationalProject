/* global process, URL */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const corpus = (
  await readFile(new URL('./corpus.jsonl', import.meta.url), 'utf8')
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
if (
  corpus.length < 10 ||
  new Set(corpus.map((item) => item.id)).size !== corpus.length
) {
  throw new Error('Corpus inválido ou insuficiente');
}
const real = process.argv.includes('--real');
const budget = Number(process.env.EVALUATION_MAX_USD ?? 0);
if (real && (!Number.isFinite(budget) || budget <= 0)) {
  throw new Error('Defina EVALUATION_MAX_USD antes de avaliar com IA real.');
}
const report = {
  generatedAt: new Date().toISOString(),
  mode: real ? 'real-review-preparation' : 'fake-review-preparation',
  sampleCount: corpus.length,
  maxCostUsd: real ? budget : 0,
  spentUsd: null,
  p50LatencyMs: null,
  p95LatencyMs: null,
  humanScores: Object.fromEntries(corpus.map((item) => [item.id, null])),
  status: 'awaiting_manual_review_and_measurements',
  note: 'Este comando prepara a avaliação. Ele não chama modelos nem afirma qualidade pedagógica sem revisão humana.',
};
await mkdir('test-results/evaluations', { recursive: true });
await writeFile(
  join('test-results/evaluations', 'report.json'),
  JSON.stringify(report, null, 2),
);
process.stdout.write(
  `Corpus válido: ${corpus.length} casos. Relatório preparado em test-results/evaluations/report.json.\n`,
);
