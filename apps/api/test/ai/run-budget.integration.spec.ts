import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { AiRunBudget } from '../../src/infrastructure/ai/run-budget.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('shared paid-run budget', () => {
  it('acrescenta Luna mantendo gastos, reservas, teto e preços históricos', async () => {
    await migrate(databaseUrl!);
    const config = {
      id: randomUUID(),
      maxUsd: 0.02,
      prices: [{ model: 'old', inputPerMillion: 0.1, outputPerMillion: 0.4 }],
    };
    const original = new AiRunBudget(databaseUrl!, config);
    const migrated = new AiRunBudget(databaseUrl!, {
      ...config,
      prices: [
        ...config.prices,
        { model: 'gpt-6-luna', inputPerMillion: 0.125, outputPerMillion: 0.5 },
      ],
    });
    const changed = new AiRunBudget(databaseUrl!, {
      ...config,
      prices: [{ ...config.prices[0]!, inputPerMillion: 0.01 }],
    });
    const increased = new AiRunBudget(databaseUrl!, { ...config, maxUsd: 1 });
    const request = {
      schema: 'fixture',
      inputTokenUpperBound: 1000,
      maxOutputTokens: 2000,
    };
    try {
      const old = original.observer();
      await old.beforeRequest({ ...request, model: 'old' });
      await old.receivedResponse({
        model: 'old',
        schema: 'fixture',
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
      });
      const ongoing = original.observer();
      await ongoing.beforeRequest({ ...request, model: 'old' });
      const luna = migrated.observer();
      await luna.beforeRequest({ ...request, model: 'gpt-6-luna' });
      const ledger = (
        await original.pool.query('SELECT * FROM ai_run_budget WHERE id=$1', [
          config.id,
        ])
      ).rows[0];
      expect(Number(ledger.max_micro_usd)).toBe(20000);
      expect(Number(ledger.spent_micro_usd)).toBe(50);
      expect(Number(ledger.reserved_micro_usd)).toBe(900 + 1125);
      expect(ledger.prices).toEqual([
        ...config.prices,
        { model: 'gpt-6-luna', inputPerMillion: 0.125, outputPerMillion: 0.5 },
      ]);
      await expect(
        changed.observer().beforeRequest({ ...request, model: 'old' }),
      ).rejects.toThrow('AI_RUN_BUDGET_CONFIG_CHANGED');
      await expect(
        increased.observer().beforeRequest({ ...request, model: 'old' }),
      ).rejects.toThrow('AI_RUN_BUDGET_CONFIG_CHANGED');
      await luna.receivedResponse({
        model: 'gpt-6-luna',
        schema: 'fixture',
        inputTokens: 1000,
        cachedInputTokens: 900,
        outputTokens: 100,
      });
      const settled = (
        await original.pool.query(
          'SELECT spent_micro_usd,reserved_micro_usd FROM ai_run_budget WHERE id=$1',
          [config.id],
        )
      ).rows[0];
      expect(Number(settled.spent_micro_usd)).toBe(225);
      expect(Number(settled.reserved_micro_usd)).toBe(900);
      await ongoing.requestFinished!();
    } finally {
      await original.pool.query(
        'DELETE FROM ai_call_reservation WHERE run_id=$1',
        [config.id],
      );
      await original.pool.query('DELETE FROM ai_run_budget WHERE id=$1', [
        config.id,
      ]);
      await Promise.all([
        original.pool.end(),
        migrated.pool.end(),
        changed.pool.end(),
        increased.pool.end(),
      ]);
    }
  });

  it('serializes concurrent reservations across workers, preserves timeout cost and restart balance', async () => {
    await migrate(databaseUrl!);
    const config = {
      id: randomUUID(),
      maxUsd: 0.2,
      prices: [
        { model: 'fixture', inputPerMillion: 100, outputPerMillion: 100 },
      ],
    };
    const first = new AiRunBudget(databaseUrl!, config);
    const second = new AiRunBudget(databaseUrl!, config);
    const observers = [first.observer(), second.observer(), second.observer()];
    try {
      const input = {
        model: 'fixture',
        schema: 'fixture',
        inputTokenUpperBound: 500,
        maxOutputTokens: 500,
      };
      const reservations = await Promise.allSettled(
        observers.map((observer) => observer.beforeRequest(input)),
      );
      expect(
        reservations.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(2);
      expect(
        reservations.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const accepted = observers.filter(
        (_, index) => reservations[index]?.status === 'fulfilled',
      );
      await accepted[0]!.receivedResponse({
        model: 'fixture',
        schema: 'fixture',
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
      });
      await accepted[1]!.requestFinished!();
      const totals = (
        await first.pool.query(
          'SELECT spent_micro_usd,reserved_micro_usd FROM ai_run_budget WHERE id=$1',
          [config.id],
        )
      ).rows[0];
      expect(Number(totals.spent_micro_usd)).toBe(120000);
      expect(Number(totals.reserved_micro_usd)).toBe(0);
      const restarted = second.observer();
      await expect(restarted.beforeRequest(input)).rejects.toThrow(
        'AI_RUN_BUDGET_EXCEEDED',
      );
      await expect(
        first.observer().beforeRequest({ ...input, model: 'unpriced' }),
      ).rejects.toThrow('AI_RUN_MODEL_UNPRICED');
    } finally {
      await first.pool.query(
        'DELETE FROM ai_call_reservation WHERE run_id=$1',
        [config.id],
      );
      await first.pool.query('DELETE FROM ai_run_budget WHERE id=$1', [
        config.id,
      ]);
      await first.pool.end();
      await second.pool.end();
    }
  });
});
