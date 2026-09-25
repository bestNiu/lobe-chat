import type { ModelTokensUsage } from '@lobechat/types';

/** Token classes accepted by AgentQuotaService.recordUsage (`@lobechat/heterogeneous-agents/quota`). */
export interface YoulinTokenUsage {
  cacheRead?: number;
  cacheWrite5m?: number;
  input?: number;
  output?: number;
  reasoning?: number;
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Map the runtime's provider-normalised usage onto ledger token classes.
 *
 * Returns undefined when the provider reported nothing: a silent zero would understate consumption
 * and later make a token quota unenforceable, so "unknown" must stay unknown. Cached input is a
 * subset of input tokens (not additional), matching the ledger's existing semantics.
 */
export const mapModelUsage = (
  usage: ModelTokensUsage | undefined,
): YoulinTokenUsage | undefined => {
  if (!usage) return undefined;
  const mapped: YoulinTokenUsage = {};
  const input = positive(usage.totalInputTokens);
  const output = positive(usage.totalOutputTokens);
  const cacheRead = positive(usage.inputCachedTokens);
  const cacheWrite = positive(usage.inputWriteCacheTokens);
  const reasoning = positive(usage.outputReasoningTokens);
  if (input !== undefined) mapped.input = input;
  if (output !== undefined) mapped.output = output;
  if (cacheRead !== undefined) mapped.cacheRead = cacheRead;
  if (cacheWrite !== undefined) mapped.cacheWrite5m = cacheWrite;
  if (reasoning !== undefined) mapped.reasoning = reasoning;
  return Object.keys(mapped).length > 0 ? mapped : undefined;
};
