import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createPool, transaction } from '../db/pool.js';
import type { AiAccounting } from './provider.js';

type Price = {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
};
type BudgetConfig = { id: string; maxUsd: number; prices: Price[] };
type BudgetRow = {
  max_micro_usd: string;
  spent_micro_usd: string;
  reserved_micro_usd: string;
  prices: Price[];
};

class BudgetError extends Error {
  readonly code = 'AI_RUN_BUDGET_EXCEEDED';
  readonly retryable = false;
}

function cost(price: Price, input: number, output: number) {
  if (
    ![input, output].every((value) => Number.isSafeInteger(value) && value >= 0)
  ) {
    throw new BudgetError('AI_RUN_TOKEN_COUNT_INVALID');
  }
  return Math.ceil(
    input * price.inputPerMillion + output * price.outputPerMillion,
  );
}

export class AiRunBudget {
  readonly pool: pg.Pool;
  private readonly maxMicroUsd: number;

  constructor(
    databaseUrl: string,
    private readonly config: BudgetConfig,
  ) {
    this.maxMicroUsd = Math.floor(config.maxUsd * 1_000_000);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        config.id,
      ) ||
      !Number.isSafeInteger(this.maxMicroUsd) ||
      this.maxMicroUsd <= 0 ||
      config.prices.length === 0 ||
      new Set(config.prices.map((price) => price.model)).size !==
        config.prices.length ||
      config.prices.some(
        (price) =>
          !price.model ||
          !Number.isFinite(price.inputPerMillion) ||
          price.inputPerMillion <= 0 ||
          !Number.isFinite(price.outputPerMillion) ||
          price.outputPerMillion < 0,
      )
    ) {
      throw new BudgetError('AI_RUN_BUDGET_CONFIG_INVALID');
    }
    this.pool = createPool(databaseUrl);
  }

  observer(): AiAccounting {
    let reservationId: string | null = null;
    let price: Price | undefined;
    return {
      beforeRequest: async (input) => {
        price = this.config.prices.find((item) => item.model === input.model);
        if (!price || reservationId) {
          throw new BudgetError('AI_RUN_MODEL_UNPRICED');
        }
        const reserved = cost(
          price,
          input.inputTokenUpperBound,
          input.maxOutputTokens,
        );
        await transaction(this.pool, async (client) => {
          await client.query(
            'INSERT INTO ai_run_budget(id,max_micro_usd,prices) VALUES ($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING',
            [
              this.config.id,
              this.maxMicroUsd,
              JSON.stringify(this.config.prices),
            ],
          );
          const row = (
            await client.query<BudgetRow>(
              'SELECT * FROM ai_run_budget WHERE id=$1 FOR UPDATE',
              [this.config.id],
            )
          ).rows[0]!;
          // JSONB changes object key order; compare price fields.
          if (
            Number(row.max_micro_usd) !== this.maxMicroUsd ||
            row.prices.length > this.config.prices.length ||
            row.prices.some(
              (item, index) =>
                item.model !== this.config.prices[index]?.model ||
                item.inputPerMillion !==
                  this.config.prices[index]?.inputPerMillion ||
                item.outputPerMillion !==
                  this.config.prices[index]?.outputPerMillion,
            )
          ) {
            throw new BudgetError('AI_RUN_BUDGET_CONFIG_CHANGED');
          }
          // A model migration may append priced models; historical prices,
          // the run ID, spend, reservations and cap must remain untouched.
          if (row.prices.length < this.config.prices.length) {
            await client.query(
              'UPDATE ai_run_budget SET prices=$2::jsonb WHERE id=$1',
              [this.config.id, JSON.stringify(this.config.prices)],
            );
          }
          if (
            Number(row.spent_micro_usd) +
              Number(row.reserved_micro_usd) +
              reserved >
            this.maxMicroUsd
          ) {
            throw new BudgetError('AI_RUN_BUDGET_EXCEEDED');
          }
          const id = randomUUID();
          await client.query(
            "INSERT INTO ai_call_reservation(id,run_id,model,schema_name,reserved_micro_usd,state) VALUES ($1,$2,$3,$4,$5,'reserved')",
            [id, this.config.id, input.model, input.schema, reserved],
          );
          await client.query(
            'UPDATE ai_run_budget SET reserved_micro_usd=reserved_micro_usd+$2 WHERE id=$1',
            [this.config.id, reserved],
          );
          reservationId = id;
        });
      },
      receivedResponse: async (usage) => {
        if (!reservationId || !price) {
          throw new BudgetError('AI_RUN_RESERVATION_MISSING');
        }
        if (
          !(
            usage.model === price.model ||
            usage.model.startsWith(`${price.model}-`)
          )
        ) {
          throw new BudgetError('AI_RUN_MODEL_UNPRICED');
        }
        const charged = cost(price, usage.inputTokens, usage.outputTokens);
        await this.settle(
          reservationId,
          charged,
          usage.inputTokens,
          usage.outputTokens,
        );
        reservationId = null;
      },
      requestFinished: async () => {
        if (reservationId) {
          // Timeout/invalid usage remains conservatively charged. A killed
          // process leaves its reservation locked, so restart cannot overspend.
          await this.settle(reservationId);
          reservationId = null;
        }
      },
    };
  }

  private async settle(
    id: string,
    charged?: number,
    input?: number,
    output?: number,
  ) {
    await transaction(this.pool, async (client) => {
      await client.query('SELECT 1 FROM ai_run_budget WHERE id=$1 FOR UPDATE', [
        this.config.id,
      ]);
      const row = (
        await client.query<{ reserved_micro_usd: string; state: string }>(
          'SELECT reserved_micro_usd,state FROM ai_call_reservation WHERE run_id=$1 AND id=$2 FOR UPDATE',
          [this.config.id, id],
        )
      ).rows[0];
      if (!row || row.state !== 'reserved') {
        throw new BudgetError('AI_RUN_RESERVATION_INVALID');
      }
      const reserved = Number(row.reserved_micro_usd);
      const amount = charged ?? reserved;
      await client.query(
        'UPDATE ai_run_budget SET reserved_micro_usd=reserved_micro_usd-$2,spent_micro_usd=spent_micro_usd+$3 WHERE id=$1',
        [this.config.id, reserved, amount],
      );
      await client.query(
        'UPDATE ai_call_reservation SET charged_micro_usd=$2,input_tokens=$3,output_tokens=$4,state=$5 WHERE id=$1',
        [
          id,
          amount,
          input ?? null,
          output ?? null,
          charged === undefined ? 'unknown_usage' : 'measured',
        ],
      );
    });
  }
}

const budgets = new Map<string, AiRunBudget>();
export function runBudgetAccounting(
  databaseUrl: string,
): (() => AiAccounting) | undefined {
  if (!process.env.AI_RUN_BUDGET_USD) {
    return undefined;
  }
  const config: BudgetConfig = {
    id: process.env.AI_RUN_BUDGET_ID ?? '',
    maxUsd: Number(process.env.AI_RUN_BUDGET_USD),
    prices: JSON.parse(process.env.AI_RUN_PRICES_JSON ?? '[]') as Price[],
  };
  const key = JSON.stringify([databaseUrl, config]);
  let budget = budgets.get(key);
  if (!budget) {
    budget = new AiRunBudget(databaseUrl, config);
    budgets.set(key, budget);
  }
  return () => budget.observer();
}
