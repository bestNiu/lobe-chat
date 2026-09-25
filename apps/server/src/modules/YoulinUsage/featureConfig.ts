/** Strict tri-state flag: unset and `0` stay off, `1` is on, anything else is a configuration bug. */
export const isYoulinUsageAccountingEnabled = (): boolean => {
  const value = process.env.YOULIN_USAGE_ACCOUNTING;
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error('INVALID_YOULIN_USAGE_ACCOUNTING');
};
