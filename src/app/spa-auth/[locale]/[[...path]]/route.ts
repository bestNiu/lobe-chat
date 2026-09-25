import { getServerFeatureFlagsValue } from '@/config/featureFlags';
import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { buildAnalyticsConfig, fetchViteDevTemplate, renderSpaHtml } from '@/libs/spaHtml';
import { type Locales, normalizeLocale } from '@/locales/resources';
import { getServerAuthConfig } from '@/server/globalConfig/getServerAuthConfig';
import { type AuthSPAServerConfig } from '@/types/spaServerConfig';

import { buildSeoMeta } from './seoMeta';

// Read-only runtime image + env-derived server config: static generation would make Next persist
// a prerender under `.next/server/app/<resolved params>` (ENOENT/EROFS on a read-only image) and
// could keep serving stale auth/feature config after an env change. Render per request instead.
export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  const staticLocales: Locales[] = ['en-US', 'zh-CN'];

  return staticLocales.map((locale) => ({ locale }));
}

const isDev = process.env.NODE_ENV === 'development';

async function getTemplate(): Promise<string> {
  if (isDev) return fetchViteDevTemplate('/index.auth.html');

  const { authHtmlTemplate } = await import('../../authHtmlTemplate');

  return authHtmlTemplate;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; path?: string[] }> },
) {
  const { locale: rawLocale, path } = await params;
  const locale = normalizeLocale(rawLocale);

  const authConfig: AuthSPAServerConfig = {
    analyticsConfig: buildAnalyticsConfig(),
    config: getServerAuthConfig(),
    enableOIDC: authEnv.ENABLE_OIDC,
    featureFlags: getServerFeatureFlagsValue(),
    globalCDN: appEnv.CDN_USE_GLOBAL,
  };

  const template = await getTemplate();
  const pathname = `/${(path ?? []).join('/')}`;
  const seoMeta = await buildSeoMeta(locale, pathname);

  return renderSpaHtml(template, { seoMeta, serverConfig: authConfig });
}
