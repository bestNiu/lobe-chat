import { BRANDING_NAME } from '@lobechat/business-const';

/**
 * Order-sensitive: a longer token must come before `Lobe`. `LobeHub` maps to the
 * `brandName` argument and is parked in a sentinel before the other tokens run,
 * so `Lobe` can never rewrite it into `Unionclin Hub`. Locked by the "keeps token
 * order" case in brandTokens.test.ts.
 */
const TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['Lobe AI', 'Unionclin AI'],
  ['LobeAI', 'Unionclin AI'],
  ['Lobe', 'Unionclin'],
];

const HUB_SENTINEL = '\u0000BRAND\u0000';

/** Messenger copy is bot handles and platform instructions, not product naming. */
const EXCLUDED_NAMESPACES = new Set(['messenger']);

/**
 * Setting keys whose value names the messenger bot handle. Replacing it would
 * point users at a bot that does not exist. Scoped as `ns:key`.
 */
const EXCLUDED_KEYS = new Set([
  'setting:notification.im.desc',
  'setting:notification.im.platform.desc',
]);

const replaceTokens = (value: string, brandName: string) =>
  TOKENS.reduce(
    (acc, [from, to]) => acc.split(from).join(to),
    value.split('LobeHub').join(HUB_SENTINEL),
  )
    .split(HUB_SENTINEL)
    .join(brandName);

/**
 * Rewrites brand tokens in the string leaves of a namespace record. Keys are
 * part of the i18n contract and stay untouched. Pure: same input, same output,
 * so it is safe for both SSR and CSR.
 */
export const applyBrandTokens = <T>(
  records: T,
  ns: string,
  brandName: string = BRANDING_NAME,
): T => {
  if (EXCLUDED_NAMESPACES.has(ns)) return records;
  if (typeof records === 'string') return replaceTokens(records, brandName) as T;
  if (records === null || typeof records !== 'object') return records;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(records)) {
    out[key] = EXCLUDED_KEYS.has(`${ns}:${key}`) ? value : applyBrandTokens(value, ns, brandName);
  }

  return out as T;
};

/**
 * Same rewrite for a dynamic-import module object, keeping its shape: only the
 * `default` export is an i18n record, so named exports and interop flags survive.
 */
export const applyBrandTokensToModule = <T>(mod: T, ns: string): T => {
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    return applyBrandTokens(mod, ns);
  }

  return { ...mod, default: applyBrandTokens(mod.default, ns) };
};
