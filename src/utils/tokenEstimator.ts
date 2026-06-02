/**
 * Estimate token count from text length.
 * Uses ~4 chars/token heuristic for English text.
 */
export const DEFAULT_MAX_TOKEN_THRESHOLD = 120000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function normalizeMaxTokenThreshold(value: unknown): number {
  const threshold = typeof value === "string" ? Number(value.trim()) : value;

  if (
    typeof threshold !== "number" ||
    !Number.isSafeInteger(threshold) ||
    threshold <= 0
  ) {
    return DEFAULT_MAX_TOKEN_THRESHOLD;
  }

  return threshold;
}

/**
 * Check if text exceeds the given token threshold.
 */
export function exceedsTokenLimit(text: string, maxTokens: unknown): boolean {
  return estimateTokens(text) > normalizeMaxTokenThreshold(maxTokens);
}
