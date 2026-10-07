import { PgBoss } from 'pg-boss';
import type pg from 'pg';
import { OperationRepository, operationKinds } from './operations.js';
import type { OperationKind, OperationLease } from './operations.js';

export type JobResult = { apply: (client: pg.PoolClient) => Promise<void> };
export type JobHandler = (lease: OperationLease) => Promise<JobResult>;

export function queueConcurrency(
  kind: OperationKind,
  environment: NodeJS.ProcessEnv,
) {
  const setting =
    kind === 'answer-chat'
      ? (['JOB_CHAT_CONCURRENCY', 8] as const)
      : kind === 'generate-exam'
        ? (['JOB_EXAM_CONCURRENCY', 4] as const)
        : kind === 'grade-answer' || kind === 'reevaluate-answer'
          ? (['JOB_GRADE_CONCURRENCY', 4] as const)
          : (['JOB_MATERIAL_CONCURRENCY', 2] as const);
  const value = Number(environment[setting[0]] ?? setting[1]);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('JOB_CONCURRENCY_INVALID');
  }
  return value;
}

export class OperationDispatcher {
  private readonly boss: PgBoss;
  private interval: ReturnType<typeof setInterval> | undefined;
  private dispatching = false;
  private readonly concurrency: Record<OperationKind, number>;

  constructor(
    databaseUrl: string,
    private readonly operations: OperationRepository,
  ) {
    this.concurrency = Object.fromEntries(
      operationKinds.map((kind) => [kind, queueConcurrency(kind, process.env)]),
    ) as Record<OperationKind, number>;
    this.boss = new PgBoss(databaseUrl);
    this.boss.on('error', () => {
      process.stderr.write('Falha na fila de trabalhos.\n');
    });
  }

  async start(
    handlers: Partial<Record<OperationKind, JobHandler>>,
  ): Promise<void> {
    await this.boss.start();
    for (const kind of operationKinds) {
      await this.boss.createQueue(kind, { retryLimit: 0 });
      const handler = handlers[kind];
      if (!handler) {
        continue;
      }
      await this.boss.work<{
        operationId: string;
        ownerId: string;
        inputVersion: number;
      }>(
        kind,
        {
          pollingIntervalSeconds: 1,
          localConcurrency: this.concurrency[kind],
        },
        async (jobs) => {
          for (const job of jobs) {
            const lease = await this.operations.acquire(
              job.data.operationId,
              job.data.ownerId,
              job.data.inputVersion,
            );
            if (!lease) {
              continue;
            }
            try {
              const result = await handler(lease);
              await this.operations.complete(lease, result.apply);
            } catch (error) {
              const code =
                error instanceof Error &&
                'code' in error &&
                typeof error.code === 'string'
                  ? error.code
                  : 'JOB_FAILED';
              const retryable = !(
                error instanceof Error &&
                'retryable' in error &&
                error.retryable === false
              );
              await this.operations.fail(lease, code, retryable);
            }
          }
        },
      );
    }
    this.interval = setInterval(
      () =>
        void this.dispatch().catch(() =>
          process.stderr.write('Falha ao despachar trabalho.\n'),
        ),
      1_000,
    );
    await this.dispatch();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }
    await this.boss.stop();
  }

  async dispatch(): Promise<void> {
    if (this.dispatching) {
      return;
    }
    this.dispatching = true;
    try {
      await this.operations.recoverExpired();
      for (const operation of await this.operations.pendingDispatch()) {
        const id = await this.boss.send(
          operation.kind,
          {
            operationId: operation.id,
            ownerId: operation.ownerId,
            inputVersion: operation.inputVersion,
          },
          { retryLimit: 0 },
        );
        if (id) {
          await this.operations.markDispatched(operation.id);
        }
      }
    } finally {
      this.dispatching = false;
    }
  }
}
