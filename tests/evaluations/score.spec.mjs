import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function reviews() {
  return Array.from({ length: 30 }, (_, index) => [
    {
      id: `source-${index}`,
      kind: 'source',
      latencyMs: 1000,
      costUsd: 0.001,
      humanSupported: true,
      locatorExists: true,
      unsupportedExplicit: true,
    },
    {
      id: `essay-${index}`,
      kind: 'essay',
      latencyMs: 1000,
      costUsd: 0.001,
      humanPoints: 0.8,
      aiPoints: 0.6,
      criteriaJustified: true,
    },
  ]).flat();
}

async function score(rows, budget = '1') {
  const directory = await mkdtemp(join(tmpdir(), 'study-evaluation-score-'));
  try {
    const input = join(directory, 'reviews.jsonl');
    await writeFile(input, rows.map((row) => JSON.stringify(row)).join('\n'));
    const result = spawnSync(
      process.execPath,
      [resolve('tests/evaluations/score.mjs'), input],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          EVALUATION_MAX_USD: budget,
          EVALUATION_DATASET_LABEL:
            'synthetic-regression-not-pedagogical-evidence',
        },
      },
    );
    const report = await readFile(
      join(directory, 'test-results/evaluations/scored-report.json'),
      'utf8',
    )
      .then(JSON.parse)
      .catch(() => null);
    return { result, report };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('30+30 complete reviews pass including the inclusive 0.2 boundary', async () => {
  const { result, report } = await score(reviews());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.sc004Passed, true);
  assert.equal(report.sc005Passed, true);
});

test('missing human review, failed calls and duplicate IDs are rejected', async () => {
  for (const replacement of [
    { humanSupported: null },
    { error: 'AI_OUTPUT_INCOMPLETE' },
    { id: 'essay-0' },
  ]) {
    const rows = reviews();
    rows[0] = { ...rows[0], ...replacement };
    const { result, report } = await score(rows);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});

test('bad citations, insufficient agreement and exceeded cost fail acceptance', async () => {
  for (const scenario of ['citation', 'grade', 'budget']) {
    const rows = reviews();
    if (scenario === 'citation') {
      rows[0].locatorExists = false;
    }
    if (scenario === 'grade') {
      rows
        .filter((row) => row.kind === 'essay')
        .slice(0, 4)
        .forEach((row) => {
          row.aiPoints = 0;
        });
    }
    const { result, report } = await score(
      rows,
      scenario === 'budget' ? '0.01' : '1',
    );
    assert.equal(result.status, 1);
    assert.equal(
      report[
        scenario === 'citation'
          ? 'sc004Passed'
          : scenario === 'grade'
            ? 'sc005Passed'
            : 'withinBudget'
      ],
      false,
    );
  }
});
