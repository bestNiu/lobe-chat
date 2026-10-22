import { describe, expect, it } from 'vitest';

import { loadI18nNamespaceModule } from './loadI18nNamespaceModule.vite';

const load = async (ns: string) =>
  loadI18nNamespaceModule({
    defaultLang: 'en-US',
    lng: 'en-US',
    normalizeLocale: (locale?: string) => locale ?? 'en-US',
    ns,
  });

/** Collect string values only — i18n keys are a contract and are never rewritten. */
const values = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((item) => values(item, out));
  else if (node && typeof node === 'object')
    Object.values(node).forEach((item) => values(item, out));
  return out;
};

const valuesOf = (mod: unknown) => values((mod as { default?: unknown }).default ?? mod);

/**
 * The SPA / mobile / desktop builds resolve `loadI18nNamespaceModule` to this
 * `.vite` variant (see plugins/vite/platformResolve.ts). Brand replacement must
 * therefore be wired here too, otherwise white-label copy never reaches the
 * running web app even though the base loader is wrapped.
 */
describe('loadI18nNamespaceModule.vite brand tokens', () => {
  it('rewrites product brand tokens in a default-locale namespace', async () => {
    const all = valuesOf(await load('chat'));

    expect(all.filter((value) => value.includes('LobeHub'))).toEqual([]);
    expect(all.filter((value) => value.includes('LobeAI'))).toEqual([]);
    expect(all.some((value) => value.includes('UnionclinHub'))).toBe(true);
  });

  it('keeps the messenger namespace untouched (bot handles)', async () => {
    const all = valuesOf(await load('messenger'));

    expect(all.some((value) => value.includes('LobeHub'))).toBe(true);
  });
});
