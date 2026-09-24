import type {
  YoulinModelBudgetAccount,
  YoulinModelReservation,
  YoulinModelUsage,
} from '@lobechat/types';

import { checkedMoney, priceUsage, YoulinModelBudgetError } from './money';
import { assertReservationScope } from './reservation';

/** Only pre-dispatch cancellation is safely free. Never use TTL/client abort as proof. */
export const cancelUnsentReservation = (
  account: Readonly<YoulinModelBudgetAccount>,
  reservation: Readonly<YoulinModelReservation>,
) => {
  assertReservationScope(account, reservation);
  if (reservation.state === 'cancelled') return { account, reservation };
  if (reservation.state !== 'reserved') throw new YoulinModelBudgetError('POTENTIALLY_BILLABLE');
  if (account.reservedMicroUsd < reservation.heldMicroUsd)
    throw new YoulinModelBudgetError('INVALID_ACCOUNT');
  return {
    account: { ...account, reservedMicroUsd: account.reservedMicroUsd - reservation.heldMicroUsd },
    reservation: { ...reservation, state: 'cancelled' as const },
  };
};

export const markUsageUncertain = (
  reservation: Readonly<YoulinModelReservation>,
): YoulinModelReservation => {
  if (reservation.state !== 'in_flight' && reservation.state !== 'uncertain')
    throw new YoulinModelBudgetError('INVALID_RESERVATION_STATE');
  // No release or retry grant. The reservation stays in its ORIGINAL month's account.
  return { ...reservation, state: 'uncertain' };
};

/** Trusted FINAL gateway usage only, not partial streamed counters or browser reports.
 * Snapshot pricing survives policy changes. A genuine overrun is recorded and freezes
 * further spending; it is never silently clamped/discarded to make the budget look good.
 */
export const settleModelUsage = (
  account: Readonly<YoulinModelBudgetAccount>,
  reservation: Readonly<YoulinModelReservation>,
  usage: Readonly<YoulinModelUsage>,
) => {
  assertReservationScope(account, reservation);
  const chargedMicroUsd = priceUsage(reservation.price, usage);
  if (reservation.state === 'settled') {
    if (
      !reservation.usage ||
      reservation.chargedMicroUsd !== chargedMicroUsd ||
      reservation.usage.inputTokens !== usage.inputTokens ||
      reservation.usage.cachedInputTokens !== usage.cachedInputTokens ||
      reservation.usage.outputTokens !== usage.outputTokens
    )
      throw new YoulinModelBudgetError('SETTLEMENT_CONFLICT');
    return { account, freezeUser: null, reservation, settled: false };
  }
  if (reservation.state !== 'in_flight' && reservation.state !== 'uncertain')
    throw new YoulinModelBudgetError('INVALID_RESERVATION_STATE');
  if (account.reservedMicroUsd < reservation.heldMicroUsd)
    throw new YoulinModelBudgetError('INVALID_ACCOUNT');
  const reservedMicroUsd = account.reservedMicroUsd - reservation.heldMicroUsd;
  const spentMicroUsd = checkedMoney(account.spentMicroUsd + chargedMicroUsd);
  const overrun =
    chargedMicroUsd > reservation.heldMicroUsd ||
    usage.inputTokens > reservation.inputTokenBound ||
    usage.outputTokens > reservation.maxOutputTokens;
  const freeze =
    account.frozen || overrun || spentMicroUsd + reservedMicroUsd > account.limitMicroUsd;
  return {
    // MUST apply to the user-scoped policy in the SAME transaction as this settlement.
    // null means no new freeze action; it NEVER means unfreeze.
    freezeUser: freeze ? { enterpriseId: account.enterpriseId, userId: account.userId } : null,
    account: {
      ...account,
      frozen: freeze,
      reservedMicroUsd,
      spentMicroUsd,
    },
    reservation: {
      ...reservation,
      chargedMicroUsd,
      state: 'settled' as const,
      usage: Object.freeze({ ...usage }),
    },
    settled: true,
  };
};
