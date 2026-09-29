import type pg from 'pg';
import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import { createPool } from '../../infrastructure/db/pool.js';
import type { JobHandler } from '../../infrastructure/jobs/dispatcher.js';
import type { GradeOutput } from '../../infrastructure/ai/contracts.js';

export type Criterion = {
  id: string;
  label: string;
  maxUnits: number;
  description: string;
};

export function validateGrade(output: GradeOutput, rubric: Criterion[]) {
  const byId = new Map(rubric.map((criterion) => [criterion.id, criterion]));
  if (
    rubric.length === 0 ||
    output.criteria.length !== rubric.length ||
    byId.size !== rubric.length
  ) {
    throw new Error('AI_GRADE_INVALID');
  }
  const seen = new Set<string>();
  let pointsUnits = 0;
  const scores = output.criteria.map((score) => {
    const criterion = byId.get(score.criterionId);
    if (
      !criterion ||
      seen.has(score.criterionId) ||
      !Number.isInteger(score.awardedUnits) ||
      score.awardedUnits < 0 ||
      score.awardedUnits > criterion.maxUnits
    ) {
      throw new Error('AI_GRADE_INVALID');
    }
    seen.add(score.criterionId);
    pointsUnits += score.awardedUnits;
    return {
      id: criterion.id,
      label: criterion.label,
      maxUnits: criterion.maxUnits,
      awardedUnits: score.awardedUnits,
      reason: score.reason,
    };
  });
  if (pointsUnits > 10_000) {
    throw new Error('AI_GRADE_INVALID');
  }
  return { pointsUnits, scores };
}

type GradeRow = {
  id: string;
  attempt_id: string;
  confirmed_value: string;
  statement: string;
  rubric: Criterion[];
  reference_answer: string;
};

export function createGradeJobHandler(databaseUrl: string): JobHandler {
  const pool = createPool(databaseUrl);
  const config = readConfig(process.env);
  const provider = createAiProvider(config);
  return async (lease) => {
    const result = await pool.query<GradeRow>(
      `SELECT a.id,a.attempt_id,a.confirmed_value,q.statement,qs.rubric,qs.reference_answer
       FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       JOIN question q ON q.id=a.question_id AND q.owner_id=a.owner_id
       JOIN question_secret qs ON qs.question_id=q.id AND qs.owner_id=q.owner_id
       JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.id=$2 AND a.state='confirmed_pending' AND gc.state IN ('pending','failed')
         AND att.deleted_at IS NULL AND e.deleted_at IS NULL AND q.type='essay'`,
      [lease.ownerId, lease.resourceId],
    );
    const answer = result.rows[0];
    if (!answer) {
      throw new Error('GRADE_RESOURCE_UNAVAILABLE');
    }
    const output = await provider.grade({
      statement: answer.statement,
      answer: answer.confirmed_value,
      rubric: answer.rubric.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        maxUnits: criterion.maxUnits,
      })),
      referenceAnswer: answer.reference_answer,
    });
    const grade = validateGrade(output, answer.rubric);
    return {
      apply: async (client: pg.PoolClient) => {
        const current = await client.query(
          `SELECT 1 FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
           JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
           WHERE a.owner_id=$1 AND a.id=$2 AND a.state='confirmed_pending' AND att.deleted_at IS NULL AND e.deleted_at IS NULL
           FOR UPDATE OF a`,
          [lease.ownerId, lease.resourceId],
        );
        if (!current.rowCount) {
          throw new Error('GRADE_RESOURCE_UNAVAILABLE');
        }
        const revision = await client.query<{ id: string }>(
          `INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,criterion_scores,explanation,gaps,reference_answer,model,prompt_version,rubric_version)
           VALUES ($1,$2,1,'essay',$3,$4::jsonb,$5,$6::jsonb,$7,$8,'grade-v1',1) RETURNING id`,
          [
            lease.ownerId,
            lease.resourceId,
            grade.pointsUnits,
            JSON.stringify(grade.scores),
            output.explanation,
            JSON.stringify(output.gaps),
            answer.reference_answer,
            config.aiProvider,
          ],
        );
        await client.query(
          "UPDATE grade_current SET current_revision_id=$3,state='graded' WHERE owner_id=$1 AND answer_id=$2",
          [lease.ownerId, lease.resourceId, revision.rows[0]?.id],
        );
        await client.query(
          "UPDATE answer SET state='graded' WHERE owner_id=$1 AND id=$2",
          [lease.ownerId, lease.resourceId],
        );
        await client.query(
          `UPDATE attempt SET state='completed' WHERE owner_id=$1 AND id=$2 AND state='submitted_pending'
           AND NOT EXISTS (SELECT 1 FROM grade_current gc JOIN answer a ON a.id=gc.answer_id AND a.owner_id=gc.owner_id
             WHERE a.owner_id=$1 AND a.attempt_id=$2 AND gc.state IN ('pending','failed'))`,
          [lease.ownerId, answer.attempt_id],
        );
      },
    };
  };
}
