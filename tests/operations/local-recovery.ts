import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createPool } from '../../apps/api/src/infrastructure/db/pool.js';
import { migrate } from '../../apps/api/src/infrastructure/db/migrate.js';
import { readConfig } from '../../apps/api/src/infrastructure/config.js';
import {
  MaterialStorage,
  objectKey,
} from '../../apps/api/src/infrastructure/storage/material-storage.js';
import { DeletionPurger } from '../../apps/api/src/infrastructure/deletion/purge.js';
import { OperationRepository } from '../../apps/api/src/infrastructure/jobs/operations.js';
import { ConversationsService } from '../../apps/api/src/modules/conversations/conversations.service.js';
import { ExamsService } from '../../apps/api/src/modules/exams/exams.service.js';
import { AttemptsService } from '../../apps/api/src/modules/attempts/attempts.service.js';
import { SubmissionService } from '../../apps/api/src/modules/attempts/submission.service.js';
import { MaterialsService } from '../../apps/api/src/modules/materials/materials.service.js';

const databaseUrl = process.env.DATABASE_URL!;
if (
  !new URL(databaseUrl).pathname.startsWith('/study_operations_') ||
  process.env.AI_PROVIDER !== 'fake'
) {
  throw new Error(
    'Ensaio exige banco descartável study_operations_* e IA fake.',
  );
}
const output = resolve(process.env.OPERATIONS_OUTPUT_PATH!);
if (!output.includes('/test-results/operations/')) {
  throw new Error(
    'Saída deve ficar em test-results/operations de container descartável.',
  );
}
await mkdir(output, { recursive: true });
const pool = createPool(databaseUrl);
const operations = new OperationRepository(databaseUrl);
const conversations = new ConversationsService();
const exams = new ExamsService();
const attempts = new AttemptsService();
const materials = new MaterialsService();
const storage = new MaterialStorage(pool, readConfig(process.env));
const fixturePath = join(output, 'fixture.json');
const evidence: Array<Record<string, unknown>> = [];

function worker(pauseId?: string, beforeDispatch = false) {
  return fork(resolve('tests/operations/worker-fixture.ts'), [], {
    execArgv: [
      '--import',
      resolve('apps/api/node_modules/tsx/dist/loader.mjs'),
    ],
    env: {
      ...process.env,
      OPERATIONS_PAUSE_ID: pauseId ?? '',
      OPERATIONS_BEFORE_DISPATCH: beforeDispatch ? '1' : '0',
    },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}

async function waitUntil(check: () => Promise<boolean>, label: string) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (await check()) {
      return;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timeout no ensaio: ${label}`);
}

async function killAndRecover(
  owner: string,
  id: string,
  beforeDispatch = false,
) {
  const interrupted = worker(id, beforeDispatch);
  const paused = new Promise<Record<string, unknown>>((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Worker não atingiu ponto de interrupção')),
      30000,
    );
    interrupted.on('message', (message) => {
      if ((message as { event: string }).event === 'paused') {
        clearTimeout(timer);
        done(message as Record<string, unknown>);
      }
    });
    interrupted.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Worker encerrou antes da interrupção'));
    });
  });
  try {
    const point = await paused;
    const before = await operations.get(owner, id);
    const exited = once(interrupted, 'exit');
    interrupted.kill('SIGKILL');
    await exited;
    await pool.query(
      "UPDATE operation SET lease_until=now()-interval '1 second' WHERE id=$1 AND state='running'",
      [id],
    );
    const resumed = worker();
    try {
      await waitUntil(
        async () => (await operations.get(owner, id)).state === 'completed',
        'recuperação',
      );
      const completed = await pool.query(
        "SELECT count(*)::int AS count FROM operation_event WHERE operation_id=$1 AND type='completed'",
        [id],
      );
      assert.equal(completed.rows[0].count, 1);
      const after = await operations.get(owner, id);
      evidence.push({
        kind: after.kind,
        beforeState: before.state,
        afterState: after.state,
        attempts: after.attemptCount,
        interruptedFence: point.fenceVersion ?? null,
      });
    } finally {
      const stopped = once(resumed, 'exit');
      resumed.kill('SIGKILL');
      await stopped;
    }
  } finally {
    if (interrupted.exitCode === null && interrupted.signalCode === null) {
      interrupted.kill('SIGKILL');
    }
  }
}

async function prepare() {
  await migrate(databaseUrl);
  const owner = randomUUID();
  await pool.query(
    'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
    [owner, `${owner}@example.invalid`, 'synthetic-no-login'],
  );
  const conversation = await conversations.create(owner, randomUUID(), {
    personality: 'objetiva',
  });
  const sent = await conversations.sendMessage(
    owner,
    conversation.id,
    randomUUID(),
    {
      content: 'Explique ecologia.',
      conversationVersion: conversation.version,
    },
  );
  await killAndRecover(owner, sent.operationId, true);
  const next = await conversations.get(owner, conversation.id);
  const second = await conversations.sendMessage(
    owner,
    conversation.id,
    randomUUID(),
    {
      content: 'Explique produtores e consumidores.',
      conversationVersion: next.version,
    },
  );
  await killAndRecover(owner, second.operationId);
  assert.equal(
    (await conversations.messages(owner, conversation.id)).items.length,
    4,
  );
  const exam = await exams.create(owner, randomUUID(), {
    conversationId: conversation.id,
    topicNames: ['Ecologia'],
    studyLevel: 'Médio',
    total: 10,
    objectiveCount: 9,
    essayCount: 1,
    materialIds: [],
  });
  await killAndRecover(owner, exam.operationId);
  const attemptId = (await exams.get(owner, exam.examId)).attemptId!;
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS count FROM attempt WHERE exam_id=$1',
        [exam.examId],
      )
    ).rows[0].count,
    1,
  );
  const essay = (await attempts.get(owner, attemptId)).questions.find(
    (question) => question.type === 'essay',
  )!;
  const answer = await attempts.confirm(
    owner,
    attemptId,
    essay.id,
    'Resposta parcial',
    0,
    randomUUID(),
  );
  if (!('operationId' in answer) || !answer.operationId) {
    throw new Error('Operação de correção ausente');
  }
  await killAndRecover(owner, answer.operationId);
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS count FROM grade_revision WHERE owner_id=$1',
        [owner],
      )
    ).rows[0].count,
    1,
  );
  const material = randomUUID();
  await pool.query(
    "INSERT INTO material(id,owner_id,conversation_id,original_name,detected_mime,byte_size,checksum,object_key,state) VALUES ($1,$2,$3,'fixture.txt','text/plain',5,'fixture',$4,'ready')",
    [material, owner, conversation.id, objectKey(owner, material)],
  );
  await storage.put(owner, material, new TextEncoder().encode('texto'));
  await cp(process.env.STORAGE_LOCAL_PATH!, join(output, 'storage-backup'), {
    recursive: true,
  });
  await writeFile(
    fixturePath,
    JSON.stringify({
      owner,
      conversation: conversation.id,
      material,
      attempt: attemptId,
      exam: exam.examId,
    }),
  );
  await writeFile(
    join(output, 'worker-report.json'),
    JSON.stringify(
      {
        mode: 'fake-local-physical-process',
        passed: true,
        interruptions: evidence,
        note: 'Lease envelhecido explicitamente para evitar espera de 180s; handlers reais, provedor fake, sem simular SIGKILL.',
      },
      null,
      2,
    ),
  );
}

async function deleteFixture() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  await materials.delete(fixture.owner, fixture.material);
  await new SubmissionService().delete(fixture.owner, fixture.attempt);
  await conversations.delete(fixture.owner, fixture.conversation);
}

async function verifyRestore() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const restoredRoot = resolve(process.env.STORAGE_LOCAL_PATH!);
  assert.ok(
    restoredRoot.startsWith(output + '/'),
    'Storage deve ficar sob saída isolada',
  );
  await cp(join(output, 'storage-backup'), restoredRoot, { recursive: true });
  const denied = async () => {
    await assert.rejects(
      () => conversations.get(fixture.owner, fixture.conversation),
      { status: 404 },
    );
    await assert.rejects(() => attempts.get(fixture.owner, fixture.attempt), {
      status: 404,
    });
    await assert.rejects(() => storage.read(fixture.owner, fixture.material), {
      status: 404,
    });
  };
  await denied();
  const purger = new DeletionPurger(databaseUrl);
  const unavailableRoot = restoredRoot + '-unavailable';
  try {
    await rename(restoredRoot, unavailableRoot);
    await writeFile(restoredRoot, 'synthetic outage: root is not a directory');
    try {
      await assert.rejects(() => purger.purgeDue(0));
      assert.equal(
        (
          await pool.query(
            'SELECT purge_state FROM deletion_record WHERE resource_id=$1',
            [fixture.material],
          )
        ).rows[0].purge_state,
        'pending',
      );
      await denied();
    } finally {
      await rm(restoredRoot);
      await rename(unavailableRoot, restoredRoot);
    }
    await purger.purgeDue(0);
    const records = await pool.query(
      'SELECT resource_type,purge_state FROM deletion_record ORDER BY resource_type',
    );
    assert.ok(records.rows.length >= 3);
    assert.ok(records.rows.every((record) => record.purge_state === 'purged'));
    await assert.rejects(
      () => readFile(join(restoredRoot, fixture.owner, fixture.material)),
      { code: 'ENOENT' },
    );
    await writeFile(
      join(output, 'restore-report.json'),
      JSON.stringify(
        {
          passed: true,
          mode: 'postgres-dump-restore-local-storage',
          records: records.rows,
          revokedDuringOutage: true,
          s3Status: 'not_tested',
          note: 'Purga imediata de ensaio; não mede prazo real de 24h nem backup cifrado em produção.',
        },
        null,
        2,
      ),
    );
  } finally {
    await purger.close();
  }
}

try {
  const command = process.argv[2];
  if (command === 'prepare') {
    await prepare();
  } else if (command === 'delete') {
    await deleteFixture();
  } else if (command === 'restore') {
    await verifyRestore();
  } else {
    throw new Error('Comando prepare/delete/restore obrigatório');
  }
  await pool.end();
  await operations.pool.end();
  // CLI owns its process; all writes and child shutdowns have finished. Domain
  // services retain pools for server lifetime, so terminate this disposable CLI.
  process.exit(0);
} catch (error) {
  process.stderr.write(
    `Ensaio operacional falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}\n`,
  );
  process.exit(1);
}
