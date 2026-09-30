/* global __ENV, __VU */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const mode = __ENV.MODE || 'fake';
if (mode === 'real' && !(Number(__ENV.MAX_BUDGET_USD) > 0)) {
  throw new Error('MAX_BUDGET_USD obrigatório para ensaio real.');
}
if (mode === 'real' && __ENV.REAL_RUN_ACK !== '1') {
  throw new Error('REAL_RUN_ACK=1 obrigatório para ensaio real.');
}
const base = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const origin = __ENV.APP_ORIGIN || base;
const runId = __ENV.RUN_ID || `local-${Date.now()}`;
const chatMs = new Trend('chat_response_ms');
const examMs = new Trend('exam_ready_ms');
const gradeMs = new Trend('essay_grade_ms');
const objectiveMs = new Trend('objective_feedback_ms');

export const options = {
  scenarios: {
    twenty_students: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
    chat_response_ms: ['p(95)<=10000'],
    exam_ready_ms: ['p(95)<=90000'],
    essay_grade_ms: ['p(95)<=60000'],
    objective_feedback_ms: ['p(95)<=2000'],
  },
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const value = Math.floor(Math.random() * 16);
    return (part === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

let csrf = '';
function request(method, path, body) {
  return http.request(
    method,
    `${base}/api/v1${path}`,
    body === undefined ? null : JSON.stringify(body),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-CSRF-Token': csrf,
        'Idempotency-Key': uuid(),
      },
      timeout: '30s',
    },
  );
}

function requireStatus(response, status, label) {
  if (!check(response, { [label]: (item) => item.status === status })) {
    fail(`${label}: HTTP ${response.status}`);
  }
  return response.json();
}

function waitFor(path, accepted, limitMs, metric, label, start) {
  while (Date.now() - start < limitMs) {
    const response = request('GET', path);
    if (response.status === 200) {
      const body = response.json();
      if (accepted(body)) {
        const elapsed = Date.now() - start;
        metric.add(elapsed);
        check(true, { [label]: () => true });
        return body;
      }
      if (body.state === 'failed' || body.state === 'cancelled') {
        break;
      }
    }
    sleep(0.5);
  }
  metric.add(limitMs);
  check(false, { [label]: () => false });
  fail(`${label}: timeout ou operação falhou`);
}

export default function () {
  csrf = requireStatus(
    request('GET', '/auth/csrf'),
    200,
    'csrf disponível',
  ).token;
  requireStatus(
    request('POST', '/auth/register', {
      email: `load-${runId}-${__VU}@example.invalid`,
      password: 'load-test-password-1234',
    }),
    201,
    'conta isolada',
  );
  const conversation = requireStatus(
    request('POST', '/conversations', {
      title: 'Ensaio de carga',
      personality: 'objetiva',
    }),
    201,
    'conversa criada',
  );
  const chatStart = Date.now();
  const send = requireStatus(
    request('POST', `/conversations/${conversation.id}/messages`, {
      content: 'Explique um conceito de biologia.',
      conversationVersion: conversation.version,
    }),
    202,
    'pergunta aceita',
  );
  waitFor(
    `/operations/${send.operationId}`,
    (item) => item.state === 'completed',
    10000,
    chatMs,
    'chat concluído em 10s',
    chatStart,
  );
  const examStart = Date.now();
  const exam = requireStatus(
    request('POST', '/exams', {
      conversationId: conversation.id,
      topicNames: ['Biologia'],
      studyLevel: 'Ensino médio',
      total: 10,
      objectiveCount: 9,
      essayCount: 1,
      materialIds: [],
    }),
    202,
    'prova aceita',
  );
  const ready = waitFor(
    `/exams/${exam.examId}`,
    (item) => item.state === 'ready',
    90000,
    examMs,
    'prova pronta em 90s',
    examStart,
  );
  const attempt = requireStatus(
    request('GET', `/attempts/${ready.attemptId}`),
    200,
    'tentativa disponível',
  );
  const objectives = attempt.questions.filter(
    (item) => item.type === 'objective',
  );
  const essay = attempt.questions.find((item) => item.type === 'essay');
  if (objectives.length !== 9 || !essay) {
    fail('Prova sem objetiva e discursiva');
  }
  for (const objective of objectives) {
    const optionId = objective.alternatives?.[0]?.id;
    if (!optionId) {
      fail('Objetiva sem alternativa pública');
    }
    const confirmStart = Date.now();
    const feedback = requireStatus(
      request(
        'POST',
        `/attempts/${attempt.id}/answers/${objective.id}/confirm`,
        {
          value: optionId,
          expectedVersion: 0,
        },
      ),
      201,
      'objetiva confirmada',
    );
    const elapsed = Date.now() - confirmStart;
    objectiveMs.add(elapsed);
    check(feedback, {
      'feedback objetivo completo em 2s': (item) =>
        item.status === 'graded' &&
        item.correctOptionId &&
        item.optionExplanations?.length === 4 &&
        elapsed <= 2000,
    });
  }
  const gradeStart = Date.now();
  requireStatus(
    request('POST', `/attempts/${attempt.id}/answers/${essay.id}/confirm`, {
      value: 'Resposta sintética para medir a correção.',
      expectedVersion: 0,
    }),
    201,
    'discursiva confirmada',
  );
  waitFor(
    `/attempts/${attempt.id}`,
    (item) =>
      item.questions.find((question) => question.id === essay.id)?.answer
        ?.gradeState === 'graded',
    60000,
    gradeMs,
    'discursiva corrigida em 60s',
    gradeStart,
  );
}
