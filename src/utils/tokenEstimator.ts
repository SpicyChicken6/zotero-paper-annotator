/**
 * Estimate token count from text length.
 * Uses ~4 chars/token heuristic for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if text exceeds the given token threshold.
 */
export function exceedsTokenLimit(text: string, maxTokens: number): boolean {
  return estimateTokens(text) > maxTokens;
}
