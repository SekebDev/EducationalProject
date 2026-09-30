import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import {
  InsightsService,
  parseInsightFilters,
} from '../../src/modules/insights/insights.service.js';
import { RecommendationsService } from '../../src/modules/insights/recommendations.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('consultas de evolução', () => {
  it('filtra período local, nível e tema, preserva isolamento e exclui provas incompletas e excluídas', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const envKeys = [
      'DATABASE_URL',
      'APP_ORIGIN',
      'SESSION_SECRET',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_FROM',
    ] as const;
    const previous = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
    });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const owner = randomUUID();
    const other = randomUUID();
    try {
      for (const id of [owner, other]) {
        await client.query(
          'INSERT INTO student(id,email,password_hash,timezone) VALUES ($1,$2,$3,$4)',
          [id, `${id}@example.invalid`, 'hash', 'America/Sao_Paulo'],
        );
      }
      const topic = (
        await client.query<{ id: string }>(
          "INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,'História','história') RETURNING id",
          [owner],
        )
      ).rows[0]!.id;
      const add = async (
        studentId: string,
        studyLevel: string,
        state: string,
        deleted: boolean,
        submittedAt: string,
        units: number,
        gradeState = 'graded',
      ) => {
        const exam = (
          await client.query<{ id: string }>(
            "INSERT INTO exam(owner_id,title,study_level,total,objective_count,essay_count,state,deleted_at) VALUES ($1,'Teste',$2,10,5,5,'ready',$3) RETURNING id",
            [studentId, studyLevel, deleted ? new Date() : null],
          )
        ).rows[0]!.id;
        const topicId =
          studentId === owner
            ? topic
            : (
                await client.query<{ id: string }>(
                  "INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,'História','história') RETURNING id",
                  [studentId],
                )
              ).rows[0]!.id;
        const question = (
          await client.query<{ id: string }>(
            "INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash,alternatives) VALUES ($1,$2,1,$3,$4,'objective','Questão?',$5,'[]'::jsonb) RETURNING id",
            [studentId, exam, topicId, studyLevel, randomUUID()],
          )
        ).rows[0]!.id;
        const attempt = (
          await client.query<{ id: string }>(
            'INSERT INTO attempt(owner_id,exam_id,state,submitted_at) VALUES ($1,$2,$3,$4) RETURNING id',
            [studentId, exam, state, submittedAt],
          )
        ).rows[0]!.id;
        const answer = (
          await client.query<{ id: string }>(
            "INSERT INTO answer(owner_id,attempt_id,question_id,state,confirmed_at) VALUES ($1,$2,$3,'graded',now()) RETURNING id",
            [studentId, attempt, question],
          )
        ).rows[0]!.id;
        const revision = (
          await client.query<{ id: string }>(
            "INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,explanation) VALUES ($1,$2,1,'objective',$3,'Teste') RETURNING id",
            [studentId, answer, units],
          )
        ).rows[0]!.id;
        await client.query(
          'INSERT INTO grade_current(owner_id,answer_id,current_revision_id,state) VALUES ($1,$2,$3,$4)',
          [studentId, answer, revision, gradeState],
        );
      };
      await add(
        owner,
        'Médio',
        'completed',
        false,
        '2026-01-02T02:30:00Z',
        6000,
      );
      await add(
        owner,
        'Médio',
        'completed',
        false,
        '2026-01-02T03:30:00Z',
        8000,
      );
      await add(
        owner,
        'Superior',
        'completed',
        false,
        '2026-01-02T03:30:00Z',
        10_000,
      );
      await add(
        owner,
        'Médio',
        'submitted_pending',
        false,
        '2026-01-02T03:30:00Z',
        10_000,
      );
      await add(
        owner,
        'Médio',
        'completed',
        true,
        '2026-01-02T03:30:00Z',
        10_000,
      );
      await add(
        owner,
        'Médio',
        'completed',
        false,
        '2026-01-02T03:30:00Z',
        10_000,
        'contested',
      );
      await add(
        other,
        'Médio',
        'completed',
        false,
        '2026-01-02T03:30:00Z',
        10_000,
      );
      const service = new InsightsService();
      const all = await service.get(owner, {});
      expect(all).toMatchObject({
        questionCount: 3,
        contestedCount: 1,
        percentage: 80,
      });
      expect(all.seriesByLevel).toHaveLength(3);
      const local = await service.get(owner, {
        from: '2026-01-01',
        to: '2026-01-02',
        level: 'Médio',
        topicId: topic,
      });
      expect(local).toMatchObject({ questionCount: 1, percentage: 60 });
      expect(local.seriesByLevel[0]).toMatchObject({
        level: 'Médio',
        date: '2026-01-01',
      });
      expect((await service.get(other, {})).questionCount).toBe(1);
      expect(() =>
        parseInsightFilters({ timezone: 'no/such-timezone' }),
      ).toThrow();
      expect(() =>
        parseInsightFilters({ from: '2026-01-02', to: '2026-01-01' }),
      ).toThrow();
      await add(
        owner,
        'Médio',
        'completed',
        false,
        '2026-01-03T03:30:00Z',
        4000,
      );
      const recommendations = new RecommendationsService(service);
      const listed = await recommendations.list(owner, { level: 'Médio' });
      expect(listed.recommendations).toHaveLength(1);
      const recommendation = listed.recommendations[0]!;
      expect(recommendation.action).toContain('Pratique');
      expect(
        (await recommendations.requireCurrent(owner, recommendation.id)).id,
      ).toBe(recommendation.id);
      await client.query(
        "UPDATE grade_current SET state='contested' WHERE owner_id=$1 AND answer_id=$2",
        [owner, recommendation.evidenceAnswerIds[0]],
      );
      await expect(
        recommendations.requireCurrent(owner, recommendation.id),
      ).rejects.toMatchObject({ code: 'STALE_EVIDENCE' });
    } finally {
      await client.end();
      for (const key of envKeys) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    }
  });
});
