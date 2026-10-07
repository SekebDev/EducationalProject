export function measurePhase(metric, success, limitMs, action, now = Date.now) {
  const start = now();
  let completed = false;
  try {
    const result = action(start);
    completed = true;
    return result;
  } finally {
    const elapsed = Math.max(0, now() - start);
    // Failures are right-censored above the target, never success-shaped samples.
    metric.add(completed ? elapsed : Math.max(limitMs + 1, elapsed), {
      outcome: completed ? 'completed' : 'failed_or_timeout',
    });
    success.add(completed && elapsed <= limitMs);
  }
}

export function loadReport(data, mode, runId) {
  const targets = [
    ['chat_response_ms', 'chat_success', 20, 10000],
    ['exam_ready_ms', 'exam_success', 20, 90000],
    ['essay_grade_ms', 'essay_success', 20, 60000],
    ['objective_feedback_ms', 'objective_success', 180, 2000],
  ];
  const phases = targets.map(([name, rateName, minimumCount, limitMs]) => {
    const values = data.metrics[name]?.values ?? {};
    const rate = data.metrics[rateName]?.values.rate ?? 0;
    const count =
      data.metrics[`phase_observations{phase:${name}}`]?.values.count ?? 0;
    const p95 = values['p(95)'] ?? null;
    return {
      name,
      count,
      minimumCount,
      limitMs,
      p95,
      successRate: rate,
      passed:
        count >= minimumCount && rate >= 0.95 && p95 !== null && p95 <= limitMs,
    };
  });
  const infrastructurePassed = ['checks', 'http_req_failed'].every((name) =>
    Object.values(
      data.metrics[name]?.thresholds ?? { missing: { ok: false } },
    ).every((threshold) => threshold.ok),
  );
  return {
    mode,
    runId,
    phases,
    passed: infrastructurePassed && phases.every((phase) => phase.passed),
    costUsd: null,
    costStatus:
      mode === 'real'
        ? 'requires_provider_usage_report'
        : 'fake_no_provider_calls',
    chatMeasurement:
      'completed_response (upper bound for first content; heartbeat is excluded)',
    note: 'Falhas entram acima do limite; fases não alcançadas falham pela contagem. Fake não comprova SC-009 real.',
  };
}
