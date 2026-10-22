import { BRANDING_NAME } from '@lobechat/business-const';
import { describe, expect, it } from 'vitest';

import { applyBrandTokens, applyBrandTokensToModule } from './brandTokens';

describe('applyBrandTokens', () => {
  it('replaces every token', () => {
    const out = applyBrandTokens(
      { a: 'LobeHub / Lobe AI / LobeAI / Lobe Support' },
      'setting',
      'ACME',
    );

    expect(out.a).toBe('ACME / Unionclin AI / Unionclin AI / Unionclin Support');
  });

  it('keeps token order (short token must not run first)', () => {
    const out = applyBrandTokens({ a: 'LobeHub' }, 'setting');

    expect(out.a).toBe(BRANDING_NAME);
    expect(out.a).not.toBe('Unionclin Hub');
  });

  it('never touches keys', () => {
    const out = applyBrandTokens({ 'response.LobeHubModelDeprecated': 'x' }, 'error');

    expect(Object.keys(out)).toEqual(['response.LobeHubModelDeprecated']);
  });

  it('skips excluded namespaces', () => {
    const input = { a: 'LobeHub bot' };

    expect(applyBrandTokens(input, 'messenger', 'ACME')).toBe(input);
  });

  it('skips excluded setting keys', () => {
    const out = applyBrandTokens(
      { 'notification.im.desc': 'via the LobeHub bot', 'notification.push.desc': 'LobeHub app' },
      'setting',
    );

    expect(out['notification.im.desc']).toBe('via the LobeHub bot');
    expect(out['notification.push.desc']).toBe(`${BRANDING_NAME} app`);
  });

  it('keeps lowercase domains and ids intact', () => {
    const out = applyBrandTokens({ a: 'lobehub.com / lobehub / sk-lh-' }, 'setting');

    expect(out.a).toBe('lobehub.com / lobehub / sk-lh-');
  });

  it('is identity when brand name is LobeHub', () => {
    const input = { a: 'LobeHub' };

    expect(applyBrandTokens(input, 'setting', 'LobeHub')).toEqual(input);
  });
});

describe('applyBrandTokensToModule', () => {
  it('rewrites only the default export of an import() module object', () => {
    const mod = { __esModule: true, default: { a: 'LobeHub' } };

    expect(applyBrandTokensToModule(mod, 'setting')).toEqual({
      __esModule: true,
      default: { a: BRANDING_NAME },
    });
  });
});
