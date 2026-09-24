import type { YoulinModelPrice, YoulinModelUsage } from '@lobechat/types';

export class YoulinModelBudgetError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'YoulinModelBudgetError';
  }
}

const MAX_AMOUNT = 9_223_372_036_854_775_807n;
const MILLION = 1_000_000n;

export const checkedMoney = (value: bigint) => {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_AMOUNT)
    throw new YoulinModelBudgetError('INVALID_MONEY');
  return value;
};

/** Decimal USD without scientific notation; never go through Number/parseFloat. */
export const parseUsd = (value: string) => {
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(value))
    throw new YoulinModelBudgetError('INVALID_USD');
  const [whole, fraction = ''] = value.split('.');
  return checkedMoney(BigInt(whole) * MILLION + BigInt(fraction.padEnd(6, '0')));
};

export const checkedTokens = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new YoulinModelBudgetError('INVALID_USAGE');
  return BigInt(value);
};

export const snapshotPrice = (price: Readonly<YoulinModelPrice>) => {
  if (typeof price.version !== 'string' || !price.version || price.version.length > 128)
    throw new YoulinModelBudgetError('INVALID_PRICE');
  return Object.freeze({
    cachedInputMicroUsdPerMillion: checkedMoney(price.cachedInputMicroUsdPerMillion),
    inputMicroUsdPerMillion: checkedMoney(price.inputMicroUsdPerMillion),
    outputMicroUsdPerMillion: checkedMoney(price.outputMicroUsdPerMillion),
    requestMicroUsd: checkedMoney(price.requestMicroUsd),
    version: price.version,
  });
};

/** Round up ONCE per request, by less than one micro-dollar. */
export const priceUsage = (
  price: Readonly<YoulinModelPrice>,
  usage: Readonly<YoulinModelUsage>,
) => {
  const rates = snapshotPrice(price);
  const input = checkedTokens(usage.inputTokens);
  const cached = checkedTokens(usage.cachedInputTokens);
  const output = checkedTokens(usage.outputTokens);
  if (cached > input) throw new YoulinModelBudgetError('INVALID_USAGE');
  const numerator =
    (input - cached) * rates.inputMicroUsdPerMillion +
    cached * rates.cachedInputMicroUsdPerMillion +
    output * rates.outputMicroUsdPerMillion;
  return checkedMoney((numerator + MILLION - 1n) / MILLION + rates.requestMicroUsd);
};

export const quoteUpperBound = (
  price: Readonly<YoulinModelPrice>,
  input: number,
  output: number,
) => {
  const rates = snapshotPrice(price);
  // Do not assume that cache tokens are always cheaper than uncached input.
  return priceUsage(rates, {
    cachedInputTokens:
      rates.cachedInputMicroUsdPerMillion > rates.inputMicroUsdPerMillion ? input : 0,
    inputTokens: input,
    outputTokens: output,
  });
};
