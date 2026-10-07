export type Evidence = {
  answerId: string;
  attemptId: string;
  revisionId: string;
  topicId: string;
  level: string;
  submittedAt: Date;
  localDate: string;
  pointsUnits: number | null;
  gradeState: 'graded' | 'pending' | 'failed' | 'contested';
};

export type Classification =
  | 'insufficient_data'
  | 'attention'
  | 'developing'
  | 'strength';

export function classify(
  pointsUnits: number,
  possibleUnits: number,
  questionCount: number,
): Classification {
  if (questionCount < 3) {
    return 'insufficient_data';
  }
  if (pointsUnits * 100 < possibleUnits * 60) {
    return 'attention';
  }
  if (pointsUnits * 100 < possibleUnits * 80) {
    return 'developing';
  }
  return 'strength';
}

export function percentage(
  pointsUnits: number,
  possibleUnits: number,
): number | null {
  if (possibleUnits === 0) {
    return null;
  }
  return (
    Math.floor((pointsUnits * 1_000 + possibleUnits / 2) / possibleUnits) / 10
  );
}

export function summarizeEvidence(rows: Evidence[]) {
  const valid = rows.filter(
    (row) => row.gradeState === 'graded' && row.pointsUnits !== null,
  );
  const pendingCount = rows.filter(
    (row) => row.gradeState === 'pending' || row.gradeState === 'failed',
  ).length;
  const contestedCount = rows.filter(
    (row) => row.gradeState === 'contested',
  ).length;
  const pointsUnits = valid.reduce(
    (sum, row) => sum + (row.pointsUnits ?? 0),
    0,
  );
  const possibleUnits = valid.length * 10_000;
  const groups = new Map<string, Evidence[]>();
  for (const row of valid) {
    const key = `${row.topicId}\u0000${row.level}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const topics = [...groups.values()].map((group) => {
    const first = group[0]!;
    const units = group.reduce((sum, row) => sum + (row.pointsUnits ?? 0), 0);
    return {
      topicId: first.topicId,
      level: first.level,
      pointsUnits: units,
      possibleUnits: group.length * 10_000,
      points: units / 10_000,
      possiblePoints: group.length,
      questionCount: group.length,
      percentage: percentage(units, group.length * 10_000),
      classification: classify(units, group.length * 10_000, group.length),
      evidenceAnswerIds: group.map((row) => row.answerId),
      evidenceRevisionIds: group.map((row) => row.revisionId),
      evidence: group.map((row) => ({
        answerId: row.answerId,
        revisionId: row.revisionId,
        attemptId: row.attemptId,
      })),
    };
  });
  const series = new Map<string, Evidence[]>();
  for (const row of valid) {
    const key = `${row.level}\u0000${row.localDate}`;
    const group = series.get(key);
    if (group) group.push(row);
    else series.set(key, [row]);
  }
  const seriesByLevel = [...series.values()]
    .map((group) => {
      const first = group[0]!;
      const units = group.reduce((sum, row) => sum + (row.pointsUnits ?? 0), 0);
      return {
        level: first.level,
        date: first.localDate,
        points: units / 10_000,
        possiblePoints: group.length,
        percentage: percentage(units, group.length * 10_000),
        questionCount: group.length,
      };
    })
    .sort(
      (left, right) =>
        left.level.localeCompare(right.level) ||
        left.date.localeCompare(right.date),
    );
  return {
    status:
      valid.length === 0
        ? pendingCount > 0
          ? 'pending'
          : 'no_valid_evidence'
        : 'ready',
    questionCount: valid.length,
    pendingCount,
    contestedCount,
    points: valid.length ? pointsUnits / 10_000 : null,
    possiblePoints: valid.length ? valid.length : null,
    percentage: percentage(pointsUnits, possibleUnits),
    topics,
    seriesByLevel,
  };
}
