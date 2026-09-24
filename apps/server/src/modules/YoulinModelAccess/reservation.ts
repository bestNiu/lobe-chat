import type {
  YoulinModelAccessPolicy,
  YoulinModelBudgetAccount,
  YoulinModelReservation,
  YoulinModelReservationRequest,
} from '@lobechat/types';

import {
  checkedMoney,
  checkedTokens,
  quoteUpperBound,
  snapshotPrice,
  YoulinModelBudgetError,
} from './money';
import { shanghaiBudgetPeriod } from './period';

export const validateAccount = (account: Readonly<YoulinModelBudgetAccount>) => {
  if (
    !account.enterpriseId ||
    !account.userId ||
    typeof account.frozen !== 'boolean' ||
    !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(account.period)
  )
    throw new YoulinModelBudgetError('INVALID_ACCOUNT');
  checkedMoney(account.limitMicroUsd);
  checkedMoney(account.reservedMicroUsd);
  checkedMoney(account.spentMicroUsd);
};

const requireGrant = (
  account: Readonly<YoulinModelBudgetAccount>,
  policy: Readonly<YoulinModelAccessPolicy>,
  request: Readonly<YoulinModelReservationRequest>,
) => {
  validateAccount(account);
  if (
    policy.enterpriseId !== account.enterpriseId ||
    policy.userId !== account.userId ||
    policy.enabled !== true
  )
    throw new YoulinModelBudgetError('MODEL_NOT_ALLOWED');
  if (policy.spendingFrozen !== false) throw new YoulinModelBudgetError('BUDGET_FROZEN');
  const grants = policy.models.filter((grant) => grant.modelId === request.modelId);
  if (grants.length !== 1) throw new YoulinModelBudgetError('MODEL_NOT_ALLOWED');
  const grant = grants[0];
  checkedTokens(grant.maxInputTokens);
  checkedTokens(grant.maxOutputTokens);
  checkedTokens(request.inputTokenBound);
  checkedTokens(request.maxOutputTokens);
  if (
    !request.modelId ||
    !request.id ||
    request.id.length > 128 ||
    !/^[a-f0-9]{64}$/.test(request.payloadDigest) ||
    request.maxOutputTokens === 0 ||
    request.inputTokenBound > grant.maxInputTokens ||
    request.maxOutputTokens > grant.maxOutputTokens
  )
    throw new YoulinModelBudgetError('INVALID_REQUEST');
  if (!grant.price) throw new YoulinModelBudgetError('PRICE_NOT_CONFIGURED');
  return snapshotPrice(grant.price);
};

export const assertReservationScope = (
  account: Readonly<YoulinModelBudgetAccount>,
  reservation: Readonly<YoulinModelReservation>,
) => {
  validateAccount(account);
  if (
    account.enterpriseId !== reservation.enterpriseId ||
    account.userId !== reservation.userId ||
    account.period !== reservation.period
  )
    throw new YoulinModelBudgetError('RESERVATION_SCOPE_MISMATCH');
  checkedMoney(reservation.heldMicroUsd);
};

/** Pure reducer only. Caller MUST lock policy/account/reservation and persist atomically.
 * A replay is a receipt, NEVER permission to send a second upstream request.
 */
export const reserveModelBudget = (
  account: Readonly<YoulinModelBudgetAccount>,
  policy: Readonly<YoulinModelAccessPolicy>,
  request: Readonly<YoulinModelReservationRequest>,
  now: Date,
  existing?: Readonly<YoulinModelReservation>,
) => {
  const price = requireGrant(account, policy, request);
  if (existing) {
    if (
      existing.enterpriseId !== account.enterpriseId ||
      existing.userId !== account.userId ||
      existing.id !== request.id ||
      existing.payloadDigest !== request.payloadDigest ||
      existing.modelId !== request.modelId ||
      existing.inputTokenBound !== request.inputTokenBound ||
      existing.maxOutputTokens !== request.maxOutputTokens
    )
      throw new YoulinModelBudgetError('IDEMPOTENCY_CONFLICT');
    return { account, created: false, reservation: existing };
  }
  if (account.period !== shanghaiBudgetPeriod(now).id)
    throw new YoulinModelBudgetError('PERIOD_MISMATCH');
  if (account.frozen) throw new YoulinModelBudgetError('BUDGET_FROZEN');
  const heldMicroUsd = quoteUpperBound(price, request.inputTokenBound, request.maxOutputTokens);
  if (account.spentMicroUsd + account.reservedMicroUsd + heldMicroUsd > account.limitMicroUsd)
    throw new YoulinModelBudgetError('BUDGET_EXHAUSTED');
  const reservation: YoulinModelReservation = {
    ...request,
    enterpriseId: account.enterpriseId,
    heldMicroUsd,
    period: account.period,
    price,
    state: 'reserved',
    userId: account.userId,
  };
  return {
    account: {
      ...account,
      reservedMicroUsd: checkedMoney(account.reservedMicroUsd + heldMicroUsd),
    },
    created: true,
    reservation,
  };
};

/** Atomically claim once BEFORE I/O; a crash afterwards remains potentially billable. */
export const beginModelDispatch = (
  account: Readonly<YoulinModelBudgetAccount>,
  policy: Readonly<YoulinModelAccessPolicy>,
  reservation: Readonly<YoulinModelReservation>,
  now: Date,
): YoulinModelReservation => {
  assertReservationScope(account, reservation);
  const currentPrice = requireGrant(account, policy, reservation);
  if (
    currentPrice.version !== reservation.price.version ||
    currentPrice.inputMicroUsdPerMillion !== reservation.price.inputMicroUsdPerMillion ||
    currentPrice.cachedInputMicroUsdPerMillion !==
      reservation.price.cachedInputMicroUsdPerMillion ||
    currentPrice.outputMicroUsdPerMillion !== reservation.price.outputMicroUsdPerMillion ||
    currentPrice.requestMicroUsd !== reservation.price.requestMicroUsd
  )
    throw new YoulinModelBudgetError('PRICE_CHANGED');
  if (reservation.state !== 'reserved')
    throw new YoulinModelBudgetError('DISPATCH_ALREADY_CLAIMED');
  if (account.period !== shanghaiBudgetPeriod(now).id)
    throw new YoulinModelBudgetError('PERIOD_MISMATCH');
  if (account.frozen) throw new YoulinModelBudgetError('BUDGET_FROZEN');
  if (
    account.reservedMicroUsd < reservation.heldMicroUsd ||
    account.spentMicroUsd + account.reservedMicroUsd > account.limitMicroUsd
  )
    throw new YoulinModelBudgetError('BUDGET_EXHAUSTED');
  return { ...reservation, state: 'in_flight' };
};
