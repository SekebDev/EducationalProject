import { OperationRepository } from '../../apps/api/src/infrastructure/jobs/operations.js';
import { OperationDispatcher } from '../../apps/api/src/infrastructure/jobs/dispatcher.js';
import type { JobHandler } from '../../apps/api/src/infrastructure/jobs/dispatcher.js';
import { createChatJobHandler } from '../../apps/api/src/modules/conversations/chat.job.js';
import { createExamJobHandler } from '../../apps/api/src/modules/exams/exam.job.js';
import { createGradeJobHandler } from '../../apps/api/src/modules/grading/grade.job.js';

const databaseUrl = process.env.DATABASE_URL!;
if (
  !new URL(databaseUrl).pathname.startsWith('/study_operations_') ||
  process.env.AI_PROVIDER !== 'fake'
) {
  throw new Error('Worker de ensaio exige banco study_operations_* e IA fake.');
}
const operations = new OperationRepository(databaseUrl);
const dispatcher = new OperationDispatcher(databaseUrl, operations);
const pause = async () => {
  process.send?.({ event: 'paused' });
  await new Promise<void>(() => undefined);
};
const wrap =
  (handler: JobHandler): JobHandler =>
  async (lease) => {
    const result = await handler(lease);
    if (lease.id === process.env.OPERATIONS_PAUSE_ID) {
      process.send?.({ event: 'paused', fenceVersion: lease.fenceVersion });
      await new Promise<void>(() => undefined);
    }
    return result;
  };
if (process.env.OPERATIONS_BEFORE_DISPATCH === '1') {
  await pause();
}
await dispatcher.start({
  'answer-chat': wrap(createChatJobHandler(databaseUrl)),
  'generate-exam': wrap(createExamJobHandler(databaseUrl)),
  'grade-answer': wrap(createGradeJobHandler(databaseUrl)),
});
process.send?.({ event: 'ready' });
