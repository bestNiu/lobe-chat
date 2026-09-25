import { afterEach, describe, expect, it, vi } from 'vitest';

import { isYoulinUsageAccountingEnabled } from '../featureConfig';
import { recordChatUsage } from '../recordChatUsage';
import { mapModelUsage } from '../usageMapping';

const recorded = vi.hoisted(() => vi.fn());

describe('mapModelUsage', () => {
  it('maps the runtime token classes onto ledger columns', () => {
    expect(
      mapModelUsage({
        inputCachedTokens: 4,
        inputWriteCacheTokens: 2,
        outputReasoningTokens: 34,
        totalInputTokens: 66,
        totalOutputTokens: 37,
        totalTokens: 103,
      }),
    ).toEqual({ cacheRead: 4, cacheWrite5m: 2, input: 66, output: 37, reasoning: 34 });
  });

  it('keeps "unknown" unknown instead of writing a zero that hides consumption', () => {
    expect(mapModelUsage(undefined)).toBeUndefined();
    expect(mapModelUsage({})).toBeUndefined();
    expect(mapModelUsage({ totalInputTokens: Number.NaN })).toBeUndefined();
    expect(mapModelUsage({ totalInputTokens: -5 })).toBeUndefined();
    expect(mapModelUsage({ totalOutputTokens: 0 })).toEqual({ output: 0 });
  });
});

describe('recordChatUsage', () => {
  afterEach(() => recorded.mockReset());

  const params = {
    model: 'qwen3.8-max',
    operationId: 'op-1',
    provider: 'openai',
    serverDB: {} as never,
    userId: 'user-1',
    usage: { totalInputTokens: 66, totalOutputTokens: 37 },
  };

  it('writes one ledger row per observed turn with mapped tokens', async () => {
    await recordChatUsage(params, recorded);
    expect(recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'qwen3.8-max',
        operationId: 'op-1',
        provider: 'openai',
        usage: { input: 66, output: 37 },
      }),
    );
  });

  it('does not invent a row when the provider reported no usage', async () => {
    await recordChatUsage({ ...params, usage: undefined }, recorded);
    expect(recorded).not.toHaveBeenCalled();
  });

  it('never propagates a ledger failure to the caller mid-answer', async () => {
    recorded.mockRejectedValueOnce(new Error('ledger down'));
    await expect(recordChatUsage(params, recorded)).resolves.toBeUndefined();
  });
});

describe('isYoulinUsageAccountingEnabled', () => {
  const original = process.env.YOULIN_USAGE_ACCOUNTING;
  afterEach(() => {
    if (original === undefined) delete process.env.YOULIN_USAGE_ACCOUNTING;
    else process.env.YOULIN_USAGE_ACCOUNTING = original;
  });

  it('is a strict tri-state flag so a typo cannot silently change accounting', () => {
    delete process.env.YOULIN_USAGE_ACCOUNTING;
    expect(isYoulinUsageAccountingEnabled()).toBe(false);
    process.env.YOULIN_USAGE_ACCOUNTING = '0';
    expect(isYoulinUsageAccountingEnabled()).toBe(false);
    process.env.YOULIN_USAGE_ACCOUNTING = '1';
    expect(isYoulinUsageAccountingEnabled()).toBe(true);
    process.env.YOULIN_USAGE_ACCOUNTING = 'yes';
    expect(() => isYoulinUsageAccountingEnabled()).toThrow('INVALID_YOULIN_USAGE_ACCOUNTING');
  });
});
