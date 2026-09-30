import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { readConfig } from '../../infrastructure/config.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { summarizeEvidence } from './calculation.js';
import type { Evidence } from './calculation.js';

const dateSchema = z.iso.date();

export type InsightFilters = {
  topicId?: string | undefined;
  level?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  timezone?: string | undefined;
};

export function parseInsightFilters(raw: InsightFilters) {
  const result = z
    .strictObject({
      topicId: z.uuid().optional(),
      level: z.string().trim().min(1).max(200).optional(),
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      timezone: z.string().min(1).max(100).optional(),
    })
    .safeParse(raw);
  if (
    !result.success ||
    (result.data.from && result.data.to && result.data.from >= result.data.to)
  ) {
    throw new PublicError(
      422,
      'INSIGHT_FILTER_INVALID',
      'Confira tema, período e nível.',
    );
  }
  if (result.data.timezone) {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: result.data.timezone });
    } catch {
      throw new PublicError(
        422,
        'INSIGHT_FILTER_INVALID',
        'Fuso horário inválido.',
      );
    }
  }
  return result.data;
}

type EvidenceRow = {
  answer_id: string;
  attempt_id: string;
  revision_id: string | null;
  topic_id: string;
  level: string;
  submitted_at: Date;
  local_date: string;
  points_units: number | null;
  grade_state: Evidence['gradeState'];
  topic_name: string;
};

@Injectable()
export class InsightsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);

  async get(ownerId: string, raw: InsightFilters) {
    const filters = parseInsightFilters(raw);
    const timezone =
      filters.timezone ??
      (
        await this.pool.query<{ timezone: string }>(
          'SELECT timezone FROM student WHERE id=$1',
          [ownerId],
        )
      ).rows[0]?.timezone ??
      'UTC';
    const data = await this.pool.query<EvidenceRow>(
      `SELECT a.id AS answer_id,att.id AS attempt_id,gr.id AS revision_id,q.topic_id,t.display_name AS topic_name,
         q.study_level_snapshot AS level,att.submitted_at,
         (att.submitted_at AT TIME ZONE $6)::date::text AS local_date,
         gr.points_units,gc.state AS grade_state
       FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       JOIN question q ON q.id=a.question_id AND q.owner_id=a.owner_id
       JOIN topic t ON t.id=q.topic_id AND t.owner_id=q.owner_id
       JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       LEFT JOIN grade_revision gr ON gr.id=gc.current_revision_id AND gr.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND att.state='completed' AND att.submitted_at IS NOT NULL
         AND att.deleted_at IS NULL AND e.deleted_at IS NULL
         AND ($2::uuid IS NULL OR q.topic_id=$2) AND ($3::text IS NULL OR q.study_level_snapshot=$3)
         AND ($4::date IS NULL OR att.submitted_at>=($4::date::timestamp AT TIME ZONE $6))
         AND ($5::date IS NULL OR att.submitted_at<($5::date::timestamp AT TIME ZONE $6))
       ORDER BY att.submitted_at,a.id`,
      [
        ownerId,
        filters.topicId ?? null,
        filters.level ?? null,
        filters.from ?? null,
        filters.to ?? null,
        timezone,
      ],
    );
    const evidence: Evidence[] = data.rows.map((row) => ({
      answerId: row.answer_id,
      attemptId: row.attempt_id,
      revisionId: row.revision_id ?? '',
      topicId: row.topic_id,
      level: row.level,
      submittedAt: row.submitted_at,
      localDate: row.local_date,
      pointsUnits: row.points_units,
      gradeState: row.grade_state,
    }));
    const summary = summarizeEvidence(evidence);
    const names = new Map(
      data.rows.map((row) => [row.topic_id, row.topic_name]),
    );
    return {
      ...summary,
      filters: { ...filters, timezone },
      topics: summary.topics.map((topic) => ({
        ...topic,
        name: names.get(topic.topicId) ?? 'Tema',
      })),
    };
  }
}
