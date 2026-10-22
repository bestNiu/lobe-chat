import { SOCIAL_URL } from '@lobechat/business-const';
import { describe, expect, it } from 'vitest';

import { EMAIL_SUPPORT_ADDRESS, getEmailSupportHtml, getEmailSupportText } from './support';

describe('email support helpers', () => {
  it('renders actionable support links for HTML and plain-text emails', () => {
    const html = getEmailSupportHtml();
    const text = getEmailSupportText();

    expect(EMAIL_SUPPORT_ADDRESS).toBe('notify@unionclin.com');
    expect(html).toContain('href="mailto:notify@unionclin.com"');
    expect(text).toContain('notify@unionclin.com');
    // White-label deployment ships without a Discord invite: no dead link.
    expect(SOCIAL_URL.discord).toBe('');
    expect(html).not.toContain('discord');
    expect(text).not.toContain('discord');
  });

  it('escapes localized labels before rendering HTML', () => {
    const html = getEmailSupportHtml({
      contactSupport: '<script>alert("support")</script>',
      joinDiscord: '<strong>Discord</strong>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // No Discord invite URL is configured, so the channel label is omitted
    // entirely rather than rendered as an unescaped/dead link.
    expect(html).not.toContain('<strong>');
    expect(html).not.toContain('&lt;strong&gt;');
  });
});
