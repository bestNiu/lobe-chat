/** Strict tri-state flag: unset and `0` stay off, `1` is on, anything else is a configuration bug. */
export const isYoulinModelAccessControlEnabled = (): boolean => {
  const value = process.env.YOULIN_MODEL_ACCESS_CONTROL;
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error('INVALID_YOULIN_MODEL_ACCESS_CONTROL');
};
