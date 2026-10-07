import { readConfig } from './infrastructure/config.js';
import { loadLocalEnv } from './infrastructure/load-env.js';
import { OperationRepository } from './infrastructure/jobs/operations.js';
import { OperationDispatcher } from './infrastructure/jobs/dispatcher.js';
import { createChatJobHandler } from './modules/conversations/chat.job.js';
import { createExamJobHandler } from './modules/exams/exam.job.js';
import { createExtractJobHandler } from './modules/materials/extract.job.js';
import { createGradeJobHandler } from './modules/grading/grade.job.js';
import { createReevaluateJobHandler } from './modules/grading/reevaluate.job.js';
import { DeletionPurger } from './infrastructure/deletion/purge.js';

loadLocalEnv();
const config = readConfig(process.env);
const operations = new OperationRepository(config.databaseUrl);
const dispatcher = new OperationDispatcher(config.databaseUrl, operations);
await dispatcher.start({
  'answer-chat': createChatJobHandler(config.databaseUrl),
  'generate-exam': createExamJobHandler(config.databaseUrl),
  'extract-material': createExtractJobHandler(config.databaseUrl),
  'grade-answer': createGradeJobHandler(config.databaseUrl),
  'reevaluate-answer': createReevaluateJobHandler(config.databaseUrl),
});
const purger = new DeletionPurger(config.databaseUrl);
let purging = false;
const purgeTimer = setInterval(() => {
  if (purging) return;
  purging = true;
  void purger
    .purgeDue()
    .then(() => purger.pruneTutorAttempts())
    .catch(() => process.stderr.write('Falha na purga de exclusões.\n'))
    .finally(() => {
      purging = false;
    });
}, 60_000);
purging = true;
void purger
  .purgeDue()
  .catch(() => process.stderr.write('Falha na purga de exclusões.\n'))
  .finally(() => {
    purging = false;
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(purgeTimer);
    void Promise.all([dispatcher.stop(), purger.close()]).then(() =>
      process.exit(0),
    );
  });
}
