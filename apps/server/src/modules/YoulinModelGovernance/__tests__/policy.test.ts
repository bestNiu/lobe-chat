import { describe, expect, it } from 'vitest';

import { evaluateModelAccess, type YoulinModelGrant } from '../policy';

// 2026-09-15T04:00:00Z is 12:00 in Asia/Shanghai; the month boundary is 2026-09-30T16:00:00Z.
const inSeptember = new Date('2026-09-15T04:00:00.000Z');
const grant = (overrides: Partial<YoulinModelGrant> = {}): YoulinModelGrant => ({
  enabled: true,
  model: 'qwen3.8-max',
  ...overrides,
});
const facts = (overrides = {}) => ({
  grants: [grant()],
  model: 'qwen3.8-max',
  modelTokensThisPeriod: 100,
  now: inSeptember,
  totalTokensThisPeriod: 100,
  ...overrides,
});

describe('evaluateModelAccess', () => {
  it('allows a granted model under both caps and names the natural month it counted', () => {
    expect(
      evaluateModelAccess(
        facts({ grants: [grant({ monthlyTokenLimit: 1000 })], userMonthlyTokenLimit: 5000 }),
      ),
    ).toEqual({ periodId: '2026-09', reason: 'ALLOWED' });
  });

  it('denies by default: an unlisted model is not callable', () => {
    expect(evaluateModelAccess(facts({ model: 'gpt-4o' }))).toEqual({
      periodId: '2026-09',
      reason: 'MODEL_NOT_GRANTED',
    });
    expect(evaluateModelAccess(facts({ grants: [] }))).toMatchObject({
      reason: 'MODEL_NOT_GRANTED',
    });
  });

  it('keeps a disabled grant disabled instead of falling back to another row', () => {
    expect(
      evaluateModelAccess(facts({ grants: [grant({ enabled: false }), grant()] })),
    ).toMatchObject({ reason: 'MODEL_DISABLED' });
  });

  it('enforces the per-model cap before the user total, at the limit inclusive', () => {
    expect(
      evaluateModelAccess(
        facts({ grants: [grant({ monthlyTokenLimit: 100 })], userMonthlyTokenLimit: 5000 }),
      ),
    ).toMatchObject({ reason: 'MODEL_QUOTA_EXCEEDED' });
    expect(
      evaluateModelAccess(
        facts({
          grants: [grant({ monthlyTokenLimit: 101 })],
          totalTokensThisPeriod: 5000,
          userMonthlyTokenLimit: 5000,
        }),
      ),
    ).toMatchObject({ reason: 'USER_QUOTA_EXCEEDED' });
  });

  it('treats a null cap as uncapped and never invents a limit', () => {
    expect(
      evaluateModelAccess(
        facts({ grants: [grant({ monthlyTokenLimit: null })], userMonthlyTokenLimit: null }),
      ),
    ).toMatchObject({ reason: 'ALLOWED' });
  });

  it('switches period at the Asia/Shanghai month boundary, not at UTC midnight', () => {
    // 2026-09-30T16:00:00Z is 2026-10-01T00:00 in Asia/Shanghai.
    expect(evaluateModelAccess(facts({ now: new Date('2026-09-30T15:59:59Z') }))).toMatchObject({
      periodId: '2026-09',
    });
    expect(evaluateModelAccess(facts({ now: new Date('2026-09-30T16:00:00Z') }))).toMatchObject({
      periodId: '2026-10',
    });
  });

  it('refuses corrupt counters instead of reading them as zero', () => {
    for (const overrides of [
      { modelTokensThisPeriod: -1 },
      { modelTokensThisPeriod: Number.NaN },
      { modelTokensThisPeriod: 1.5 },
      { totalTokensThisPeriod: undefined },
      { model: '  ' },
      { model: undefined },
      { now: '2026-09-15' },
      { grants: undefined },
      { userMonthlyTokenLimit: -5 },
    ])
      expect(evaluateModelAccess(facts(overrides) as never)).toEqual({ reason: 'INVALID_INPUT' });
  });
});
