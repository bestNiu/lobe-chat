import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluateChatModelAccess } from '../accessControl';
import { isYoulinModelAccessControlEnabled } from '../featureConfig';

const now = new Date('2026-09-15T04:00:00.000Z');
const facts = (overrides = {}) => ({
  grants: [{ enabled: true, model: 'qwen3.8-max', monthlyTokenLimit: null }],
  model: 'qwen3.8-max',
  modelTokensThisPeriod: 10,
  now,
  periodId: '2026-09',
  totalTokensThisPeriod: 10,
  userMonthlyTokenLimit: null,
  ...overrides,
});
const reader = (value: unknown) => async () => ({ readFacts: vi.fn(async () => value) });
const request = (overrides = {}) =>
  ({ db: {}, model: 'qwen3.8-max', provider: 'openai', userId: 'user-1', ...overrides }) as never;

describe('evaluateChatModelAccess', () => {
  it('allows a granted model and denies one that is not on the list', async () => {
    expect(await evaluateChatModelAccess(request(), reader(facts()))).toEqual({
      periodId: '2026-09',
      reason: 'ALLOWED',
    });
    expect(
      await evaluateChatModelAccess(request({ model: 'gpt-4o' }), reader(facts({ grants: [] }))),
    ).toMatchObject({ reason: 'MODEL_NOT_GRANTED' });
  });

  it('enforces per-model and per-user caps from ledger counters', async () => {
    expect(
      await evaluateChatModelAccess(
        request(),
        reader(facts({ grants: [{ enabled: true, model: 'qwen3.8-max', monthlyTokenLimit: 10 }] })),
      ),
    ).toMatchObject({ reason: 'MODEL_QUOTA_EXCEEDED' });
    expect(
      await evaluateChatModelAccess(
        request(),
        reader(facts({ totalTokensThisPeriod: 500, userMonthlyTokenLimit: 500 })),
      ),
    ).toMatchObject({ reason: 'USER_QUOTA_EXCEEDED' });
  });

  it('fails closed when grants or the ledger cannot be read', async () => {
    const resolverThrows = async () => {
      throw new Error('db down');
    };
    const readerThrows = async () => ({
      readFacts: async () => {
        throw new Error('db down');
      },
    });
    expect(await evaluateChatModelAccess(request(), resolverThrows as never)).toEqual({
      reason: 'ACCESS_UNAVAILABLE',
    });
    expect(await evaluateChatModelAccess(request(), readerThrows as never)).toEqual({
      reason: 'ACCESS_UNAVAILABLE',
    });
  });

  it('refuses a blank or non-string model before touching the database', async () => {
    const readFacts = vi.fn();
    for (const model of [undefined, '', '   ', 42])
      expect(
        await evaluateChatModelAccess(request({ model }), async () => ({ readFacts }) as never),
      ).toEqual({ reason: 'INVALID_INPUT' });
    expect(readFacts).not.toHaveBeenCalled();
  });
});

describe('isYoulinModelAccessControlEnabled', () => {
  const original = process.env.YOULIN_MODEL_ACCESS_CONTROL;
  afterEach(() => {
    if (original === undefined) delete process.env.YOULIN_MODEL_ACCESS_CONTROL;
    else process.env.YOULIN_MODEL_ACCESS_CONTROL = original;
  });

  it('is a strict tri-state flag so a typo cannot silently disable enforcement', () => {
    delete process.env.YOULIN_MODEL_ACCESS_CONTROL;
    expect(isYoulinModelAccessControlEnabled()).toBe(false);
    process.env.YOULIN_MODEL_ACCESS_CONTROL = '0';
    expect(isYoulinModelAccessControlEnabled()).toBe(false);
    process.env.YOULIN_MODEL_ACCESS_CONTROL = '1';
    expect(isYoulinModelAccessControlEnabled()).toBe(true);
    process.env.YOULIN_MODEL_ACCESS_CONTROL = 'off';
    expect(() => isYoulinModelAccessControlEnabled()).toThrow(
      'INVALID_YOULIN_MODEL_ACCESS_CONTROL',
    );
  });
});
