import type { AiAccounting } from '../../apps/api/src/infrastructure/ai/provider.js';

export type Prices = {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
};

export class EvaluationBudget implements AiAccounting {
  spentUsd = 0;
  reservedUsd = 0;
  usage: Parameters<AiAccounting['receivedResponse']>[0] | null = null;

  constructor(
    readonly maxUsd: number,
    readonly prices: Prices,
  ) {
    if (
      ![maxUsd, prices.inputPerMillion, prices.outputPerMillion].every(
        (value) => Number.isFinite(value) && value > 0,
      ) ||
      !prices.model.trim()
    ) {
      throw new Error('EVALUATION_BUDGET_INVALID');
    }
  }

  beforeRequest(input: Parameters<AiAccounting['beforeRequest']>[0]) {
    if (input.model !== this.prices.model || this.reservedUsd > 0) {
      throw new Error('EVALUATION_MODEL_OR_RESERVATION_INVALID');
    }
    const reserve = this.cost(
      input.inputTokenUpperBound,
      input.maxOutputTokens,
    );
    if (this.spentUsd + reserve > this.maxUsd) {
      throw new Error('EVALUATION_BUDGET_EXCEEDED');
    }
    this.usage = null;
    this.reservedUsd = reserve;
  }

  receivedResponse(input: Parameters<AiAccounting['receivedResponse']>[0]) {
    if (
      ![input.inputTokens, input.outputTokens, input.cachedInputTokens].every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    ) {
      throw new Error('EVALUATION_USAGE_INVALID');
    }
    this.usage = input;
    this.spentUsd += this.cost(input.inputTokens, input.outputTokens);
    this.reservedUsd = 0;
    // A returned snapshot must match the price's model or a dated variant.
    if (
      !(
        input.model === this.prices.model ||
        input.model.startsWith(`${this.prices.model}-`)
      )
    ) {
      throw new Error('EVALUATION_RETURNED_MODEL_UNPRICED');
    }
    if (this.spentUsd > this.maxUsd) {
      throw new Error('EVALUATION_BUDGET_EXCEEDED');
    }
  }

  finishRequest() {
    // A timeout can be billed. Keep the entire reserve when usage is unknown.
    this.spentUsd += this.reservedUsd;
    this.reservedUsd = 0;
  }

  private cost(inputTokens: number, outputTokens: number) {
    if (
      ![inputTokens, outputTokens].every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    ) {
      throw new Error('EVALUATION_TOKEN_COUNT_INVALID');
    }
    return (
      (inputTokens * this.prices.inputPerMillion +
        outputTokens * this.prices.outputPerMillion) /
      1_000_000
    );
  }
}
