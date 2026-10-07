import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurePhase, loadReport } from './measurement.mjs';

test('HTTP failure and timeout count as failed observations above target', () => {
  for (const elapsed of [10, 2000]) {
    const values = [];
    const rates = [];
    let reads = 0;
    assert.throws(() =>
      measurePhase(
        { add: (value) => values.push(value) },
        { add: (value) => rates.push(value) },
        1000,
        () => {
          throw new Error('HTTP or polling failure');
        },
        () => (reads++ === 0 ? 0 : elapsed),
      ),
    );
    assert.deepEqual(values, [Math.max(1001, elapsed)]);
    assert.deepEqual(rates, [false]);
  }
});

test('success keeps measured duration and slow success misses target', () => {
  const values = [];
  const rates = [];
  let reads = 0;
  assert.equal(
    measurePhase(
      { add: (value) => values.push(value) },
      { add: (value) => rates.push(value) },
      1000,
      () => 'saved',
      () => (reads++ === 0 ? 0 : 1200),
    ),
    'saved',
  );
  assert.deepEqual(values, [1200]);
  assert.deepEqual(rates, [false]);
});

test('missing phases and insufficient samples cannot pass a report', () => {
  const report = loadReport({ metrics: {} }, 'fake', 'fixture');
  assert.equal(report.passed, false);
  assert.equal(report.phases.length, 4);
  assert.ok(report.phases.every((phase) => !phase.passed));
  assert.equal(report.costUsd, null);
});
