import type {
  YoulinModelAccessPolicy,
  YoulinModelBudgetAccount,
  YoulinModelPrice,
  YoulinModelReservationRequest,
} from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import { parseUsd, priceUsage, quoteUpperBound } from '../money';
import { shanghaiBudgetPeriod } from '../period';
import { beginModelDispatch, reserveModelBudget } from '../reservation';
import { cancelUnsentReservation, markUsageUncertain, settleModelUsage } from '../settlement';

// Synthetic tariffs, NOT a claim about the real gateway's prices.
const price: YoulinModelPrice = {
  cachedInputMicroUsdPerMillion: 250_000n,
  inputMicroUsdPerMillion: 1_000_000n,
  outputMicroUsdPerMillion: 2_000_000n,
  requestMicroUsd: 0n,
  version: 'synthetic-v1',
};
const now = new Date('2026-09-15T00:00:00Z');
const account = (): YoulinModelBudgetAccount => ({
  enterpriseId: 'enterprise-a',
  userId: 'user-a',
  period: '2026-09',
  frozen: false,
  limitMicroUsd: 20_000_000n,
  reservedMicroUsd: 0n,
  spentMicroUsd: 0n,
});
const policy = (): YoulinModelAccessPolicy => ({
  enabled: true,
  spendingFrozen: false,
  enterpriseId: 'enterprise-a',
  userId: 'user-a',
  models: [
    {
      modelId: 'synthetic-model',
      maxInputTokens: 1_000_000,
      maxOutputTokens: 1_000_000,
      price: { ...price },
    },
  ],
});
const request = (): YoulinModelReservationRequest => ({
  id: 'request-a',
  modelId: 'synthetic-model',
  payloadDigest: 'a'.repeat(64),
  inputTokenBound: 1000,
  maxOutputTokens: 1000,
});
const reserved = () => reserveModelBudget(account(), policy(), request(), now);
const sent = () => {
  const state = reserved();
  return {
    ...state,
    reservation: beginModelDispatch(state.account, policy(), state.reservation, now),
  };
};
const usage = { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 };

describe('exact money and trusted token accounting', () => {
  it('parses USD without floating-point rounding', () => {
    expect(parseUsd('20')).toBe(20_000_000n);
    expect(parseUsd('0.000001')).toBe(1n);
    expect(parseUsd('1.230000')).toBe(1_230_000n);
  });
  it.each(['1e2', '-1', 'NaN', '1.0000001', ' 20', '01', '9223372036854.775808'])(
    'rejects malformed/unrepresentable dollars %s',
    (value) => {
      expect(() => parseUsd(value)).toThrow();
    },
  );
  it('subtracts cached tokens from normal input and includes output once', () => {
    expect(priceUsage(price, usage)).toBe(110n);
    expect(priceUsage({ ...price, requestMicroUsd: 7n }, usage)).toBe(117n);
  });
  it('rounds once rather than rounding each price category', () => {
    expect(
      priceUsage(
        { ...price, inputMicroUsdPerMillion: 1n, outputMicroUsdPerMillion: 1n },
        { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
      ),
    ).toBe(1n);
  });
  it('quotes cache-premium models conservatively', () => {
    expect(quoteUpperBound({ ...price, cachedInputMicroUsdPerMillion: 3_000_000n }, 10, 10)).toBe(
      50n,
    );
  });
  it.each([-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid usage %s',
    (inputTokens) => {
      expect(() => priceUsage(price, { ...usage, inputTokens })).toThrow();
    },
  );
  it('rejects cache counts exceeding total input and arithmetic overflow', () => {
    expect(() => priceUsage(price, { ...usage, cachedInputTokens: 101 })).toThrow();
    expect(() =>
      quoteUpperBound(
        { ...price, outputMicroUsdPerMillion: 9_223_372_036_854_775_807n },
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow();
  });
});

describe('Shanghai calendar periods', () => {
  it('switches at Shanghai midnight, not UTC midnight or after 30 days', () => {
    expect(shanghaiBudgetPeriod(new Date('2026-01-31T15:59:59.999Z')).id).toBe('2026-01');
    expect(shanghaiBudgetPeriod(new Date('2026-01-31T16:00:00Z'))).toEqual({
      id: '2026-02',
      start: new Date('2026-01-31T16:00:00Z'),
      end: new Date('2026-02-28T16:00:00Z'),
    });
  });
  it('handles leap years and December rollover', () => {
    expect(shanghaiBudgetPeriod(new Date('2024-02-10T00:00:00Z')).end).toEqual(
      new Date('2024-02-29T16:00:00Z'),
    );
    expect(shanghaiBudgetPeriod(new Date('2026-12-31T16:00:00Z')).id).toBe('2027-01');
  });
  it('rejects invalid or unsupported historical clocks', () => {
    expect(() => shanghaiBudgetPeriod(new Date('invalid'))).toThrow();
    expect(() => shanghaiBudgetPeriod(new Date('1990-01-01'))).toThrow();
  });
});

describe('model authorization and reservation reducers (NOT a concurrent database)', () => {
  it('reserves exact maximum cost without mutating input', () => {
    const original = account();
    const result = reserveModelBudget(original, policy(), request(), now);
    expect(result.created).toBe(true);
    expect(result.account.reservedMicroUsd).toBe(3000n);
    expect(original.reservedMicroUsd).toBe(0n);
  });
  it('denies missing/foreign/disabled grants and missing prices', () => {
    for (const denied of [
      { ...policy(), userId: 'other' },
      { ...policy(), enterpriseId: 'other' },
      { ...policy(), enabled: false },
      { ...policy(), models: [] },
    ])
      expect(() => reserveModelBudget(account(), denied, request(), now)).toThrow(
        'MODEL_NOT_ALLOWED',
      );
    const grant = { ...policy().models[0], price: undefined };
    expect(() =>
      reserveModelBudget(account(), { ...policy(), models: [grant] }, request(), now),
    ).toThrow('PRICE_NOT_CONFIGURED');
  });
  it('does not normalize aliases or accept duplicate ambiguous grants', () => {
    expect(() =>
      reserveModelBudget(account(), policy(), { ...request(), modelId: 'SYNTHETIC-MODEL' }, now),
    ).toThrow('MODEL_NOT_ALLOWED');
    expect(() =>
      reserveModelBudget(
        account(),
        { ...policy(), models: [...policy().models, ...policy().models] },
        request(),
        now,
      ),
    ).toThrow('MODEL_NOT_ALLOWED');
  });
  it('enforces bounds, period, frozen state and available balance', () => {
    expect(() =>
      reserveModelBudget(account(), policy(), { ...request(), maxOutputTokens: 1_000_001 }, now),
    ).toThrow('INVALID_REQUEST');
    expect(() =>
      reserveModelBudget({ ...account(), period: '2026-08' }, policy(), request(), now),
    ).toThrow('PERIOD_MISMATCH');
    expect(() =>
      reserveModelBudget({ ...account(), frozen: true }, policy(), request(), now),
    ).toThrow('BUDGET_FROZEN');
    expect(() =>
      reserveModelBudget(
        { ...account(), spentMicroUsd: 19_999_000n, reservedMicroUsd: 999n },
        policy(),
        request(),
        now,
      ),
    ).toThrow('BUDGET_EXHAUSTED');
  });
  it('accounts for existing holds before another serial reservation', () => {
    const first = reserveModelBudget(
      { ...account(), limitMicroUsd: 5000n },
      policy(),
      request(),
      now,
    );
    expect(() =>
      reserveModelBudget(first.account, policy(), { ...request(), id: 'request-b' }, now),
    ).toThrow('BUDGET_EXHAUSTED');
  });
  it('replay does not create another hold and mismatched payload conflicts', () => {
    const state = reserved();
    const replay = reserveModelBudget(state.account, policy(), request(), now, state.reservation);
    expect(replay.created).toBe(false);
    expect(replay.account.reservedMicroUsd).toBe(3000n);
    expect(() =>
      reserveModelBudget(
        state.account,
        policy(),
        { ...request(), payloadDigest: 'b'.repeat(64) },
        now,
        state.reservation,
      ),
    ).toThrow('IDEMPOTENCY_CONFLICT');
    expect(() =>
      reserveModelBudget(
        state.account,
        { ...policy(), enabled: false },
        request(),
        now,
        state.reservation,
      ),
    ).toThrow('MODEL_NOT_ALLOWED');
  });
  it('requires a fresh quote when pricing changes before dispatch', () => {
    const state = reserved();
    const changed = {
      ...policy(),
      models: [
        { ...policy().models[0], price: { ...price, outputMicroUsdPerMillion: 3_000_000n } },
      ],
    };
    expect(() => beginModelDispatch(state.account, changed, state.reservation, now)).toThrow(
      'PRICE_CHANGED',
    );
  });

  it('takes a detached immutable price snapshot', () => {
    const currentPrice = { ...price };
    const result = reserveModelBudget(
      account(),
      { ...policy(), models: [{ ...policy().models[0], price: currentPrice }] },
      request(),
      now,
    );
    currentPrice.outputMicroUsdPerMillion = 999n;
    expect(result.reservation.price.outputMicroUsdPerMillion).toBe(price.outputMicroUsdPerMillion);
    expect(Object.isFrozen(result.reservation.price)).toBe(true);
  });
  it('checks permission again at dispatch and disallows a second claim', () => {
    const state = reserved();
    expect(() =>
      beginModelDispatch(state.account, { ...policy(), enabled: false }, state.reservation, now),
    ).toThrow('MODEL_NOT_ALLOWED');
    const dispatched = beginModelDispatch(state.account, policy(), state.reservation, now);
    expect(() => beginModelDispatch(state.account, policy(), dispatched, now)).toThrow(
      'DISPATCH_ALREADY_CLAIMED',
    );
    expect(() =>
      beginModelDispatch(state.account, policy(), state.reservation, new Date('2026-10-01')),
    ).toThrow('PERIOD_MISMATCH');
  });
});

describe('settlement and uncertain upstream outcomes', () => {
  it('settles actual usage and releases only the remainder', () => {
    const state = sent();
    const settled = settleModelUsage(state.account, state.reservation, usage);
    expect(settled.account).toMatchObject({
      spentMicroUsd: 110n,
      reservedMicroUsd: 0n,
      frozen: false,
    });
    expect(settled.reservation.state).toBe('settled');
    expect(settleModelUsage(settled.account, settled.reservation, usage).settled).toBe(false);
    expect(() =>
      settleModelUsage(settled.account, settled.reservation, { ...usage, outputTokens: 21 }),
    ).toThrow('SETTLEMENT_CONFLICT');
  });
  it('frees unsent cancellations once but never treats an in-flight abort as free', () => {
    const state = reserved();
    const cancelled = cancelUnsentReservation(state.account, state.reservation);
    expect(cancelled.account.reservedMicroUsd).toBe(0n);
    expect(
      cancelUnsentReservation(cancelled.account, cancelled.reservation).account.reservedMicroUsd,
    ).toBe(0n);
    const dispatched = sent();
    expect(() => cancelUnsentReservation(dispatched.account, dispatched.reservation)).toThrow(
      'POTENTIALLY_BILLABLE',
    );
    expect(() => settleModelUsage(cancelled.account, cancelled.reservation, usage)).toThrow(
      'INVALID_RESERVATION_STATE',
    );
  });
  it('keeps ambiguous usage held until trustworthy final reconciliation', () => {
    const state = sent();
    const uncertain = markUsageUncertain(state.reservation);
    expect(state.account.reservedMicroUsd).toBe(3000n);
    expect(() => cancelUnsentReservation(state.account, uncertain)).toThrow('POTENTIALLY_BILLABLE');
    expect(settleModelUsage(state.account, uncertain, usage).account.spentMicroUsd).toBe(110n);
  });
  it('settles late results in the original month rather than consuming next month', () => {
    const state = sent();
    expect(() =>
      settleModelUsage({ ...state.account, period: '2026-10' }, state.reservation, usage),
    ).toThrow('RESERVATION_SCOPE_MISMATCH');
    expect(settleModelUsage(state.account, state.reservation, usage).account.period).toBe(
      '2026-09',
    );
  });
  it('propagates a late overrun freeze to subsequent months for the same user', () => {
    const state = sent();
    const result = settleModelUsage(state.account, state.reservation, {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 1500,
    });
    expect(result.freezeUser).toEqual({ enterpriseId: 'enterprise-a', userId: 'user-a' });
    // Future authoritative transaction applies this effect to the user-scoped policy,
    // together with the old month's settlement. This is not a database concurrency test.
    const frozenPolicy = { ...policy(), spendingFrozen: true };
    expect(() =>
      reserveModelBudget(
        { ...account(), period: '2026-10' },
        frozenPolicy,
        { ...request(), id: 'october-request' },
        new Date('2026-10-01T00:00:00Z'),
      ),
    ).toThrow('BUDGET_FROZEN');
  });

  it('records genuine overruns and freezes spending instead of hiding excess usage', () => {
    const state = sent();
    const result = settleModelUsage(state.account, state.reservation, {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 1500,
    });
    expect(result.account).toMatchObject({
      spentMicroUsd: 4000n,
      reservedMicroUsd: 0n,
      frozen: true,
    });
    expect(() =>
      reserveModelBudget(result.account, policy(), { ...request(), id: 'next' }, now),
    ).toThrow('BUDGET_FROZEN');
  });
  it('rejects foreign settlement and invalid usage without changing held funds', () => {
    const state = sent();
    expect(() =>
      settleModelUsage({ ...state.account, userId: 'other' }, state.reservation, usage),
    ).toThrow('RESERVATION_SCOPE_MISMATCH');
    expect(() =>
      settleModelUsage(state.account, state.reservation, { ...usage, inputTokens: -1 }),
    ).toThrow('INVALID_USAGE');
    expect(state.account.reservedMicroUsd).toBe(3000n);
  });
});
