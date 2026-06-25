/**
 * Model pricing lookup and cost calculation.
 * Cost per 1M tokens for common models.
 */

export interface ModelPricing {
  prompt: number;
  completion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  "claude-3-5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-5-haiku": { prompt: 0.25, completion: 1.25 },
  "claude-3-haiku": { prompt: 0.25, completion: 1.25 },
  "claude-3-opus": { prompt: 15.0, completion: 75.0 },
};

const DEFAULT_PRICING: ModelPricing = { prompt: 1.5, completion: 5.0 };

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;
  return promptCost + completionCost;
}
