import { YoulinModelBudgetError } from './money';

/** Contemporary Asia/Shanghai calendar months, not rolling 30-day windows.
 * `now` must come from the authoritative database clock inside the transaction.
 */
export const shanghaiBudgetPeriod = (now: Date) => {
  const offset = 8 * 60 * 60 * 1000;
  const millis = now.getTime();
  if (!Number.isFinite(millis)) throw new YoulinModelBudgetError('INVALID_CLOCK');
  const local = new Date(millis + offset);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  // Fixed +08 is only used for contemporary periods (no historical Shanghai DST).
  if (year < 2000 || year > 9998) throw new YoulinModelBudgetError('INVALID_CLOCK');
  return {
    end: new Date(Date.UTC(year, month + 1, 1) - offset),
    id: `${year}-${String(month + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(year, month, 1) - offset),
  };
};
