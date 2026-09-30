import type pg from 'pg';
import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import { createPool } from '../../infrastructure/db/pool.js';
import type { JobHandler } from '../../infrastructure/jobs/dispatcher.js';
import { validateGrade } from './grade.job.js';
import type { Criterion } from './grade.job.js';

type Row = {
  id: string;
  answer_id: string;
  type: 'objective' | 'essay';
  confirmed_value: string | null;
  statement: string;
  correct_option_id: string | null;
  option_explanations: unknown;
  rubric: Criterion[] | null;
  reference_answer: string | null;
};

export function createReevaluateJobHandler(databaseUrl: string): JobHandler {
  const pool = createPool(databaseUrl);
  const config = readConfig(process.env);
  const provider = createAiProvider(config);
  return async (lease) => {
    const loaded = await pool.query<Row>(
      `SELECT d.id,d.answer_id,q.type,a.confirmed_value,q.statement,qs.correct_option_id,
         qs.option_explanations,qs.rubric,qs.reference_answer
       FROM dispute d JOIN answer a ON a.id=d.answer_id AND a.owner_id=d.owner_id
       JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       JOIN question q ON q.id=a.question_id AND q.owner_id=a.owner_id
       JOIN question_secret qs ON qs.question_id=q.id AND qs.owner_id=q.owner_id
       JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       WHERE d.owner_id=$1 AND d.id=$2 AND d.status='reviewing' AND gc.state='contested'
         AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
      [lease.ownerId, lease.resourceId],
    );
    const row = loaded.rows[0];
    if (!row) {
      throw new Error('DISPUTE_UNAVAILABLE');
    }
    let pointsUnits: number;
    let scores: unknown = null;
    let explanation: string;
    let gaps: string[] = [];
    if (!row.confirmed_value) {
      pointsUnits = 0;
      explanation = 'Questão não respondida.';
    } else if (row.type === 'objective') {
      pointsUnits = row.confirmed_value === row.correct_option_id ? 10_000 : 0;
      explanation = JSON.stringify(row.option_explanations);
    } else {
      if (!row.rubric || !row.reference_answer) {
        throw new Error('RUBRIC_UNAVAILABLE');
      }
      const output = await provider.grade({
        statement: row.statement,
        answer: row.confirmed_value,
        rubric: row.rubric.map((criterion) => ({
          id: criterion.id,
          label: criterion.label,
          maxUnits: criterion.maxUnits,
        })),
        referenceAnswer: row.reference_answer,
      });
      const grade = validateGrade(output, row.rubric);
      pointsUnits = grade.pointsUnits;
      scores = grade.scores;
      explanation = output.explanation;
      gaps = output.gaps;
    }
    return {
      apply: async (client: pg.PoolClient) => {
        const current = await client.query(
          `SELECT 1 FROM dispute d JOIN grade_current gc ON gc.answer_id=d.answer_id AND gc.owner_id=d.owner_id
           WHERE d.owner_id=$1 AND d.id=$2 AND d.status='reviewing' AND gc.state='contested' FOR UPDATE OF d,gc`,
          [lease.ownerId, lease.resourceId],
        );
        if (!current.rowCount) {
          throw new Error('DISPUTE_UNAVAILABLE');
        }
        const revision = await client.query<{ id: string }>(
          `INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,criterion_scores,explanation,gaps,reference_answer,model,prompt_version,rubric_version)
           VALUES ($1,$2,(SELECT coalesce(max(revision_number),0)+1 FROM grade_revision WHERE answer_id=$2),$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,'reevaluate-v1',1) RETURNING id`,
          [
            lease.ownerId,
            row.answer_id,
            row.confirmed_value ? row.type : 'blank',
            pointsUnits,
            scores === null ? null : JSON.stringify(scores),
            explanation,
            JSON.stringify(gaps),
            row.reference_answer,
            config.aiProvider,
          ],
        );
        const revisionId = revision.rows[0]?.id;
        await client.query(
          "UPDATE grade_current SET current_revision_id=$3,state='graded' WHERE owner_id=$1 AND answer_id=$2",
          [lease.ownerId, row.answer_id, revisionId],
        );
        await client.query(
          "UPDATE dispute SET status='resolved',resolution_revision_id=$3 WHERE owner_id=$1 AND id=$2",
          [lease.ownerId, lease.resourceId, revisionId],
        );
      },
    };
  };
}
