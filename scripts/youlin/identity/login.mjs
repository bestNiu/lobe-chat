/**
 * Local-test browser login driver. It performs a REAL human-equivalent login: it drives the
 * published loopback app through the OIDC redirect and the realm login form, then asks the app for
 * its own session. It never forges cookies, injects sessions, writes to the database, or accepts
 * credentials from argv or the environment; the person and password come from mounted 0600 files
 * and are never printed. Output is diagnostic only and is NOT product acceptance evidence.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { chromium } from '/workspace/node_modules/@playwright/test/index.mjs';

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENVIRONMENT: ${name}`);
  return value;
};
const appUrl = requireEnv('YOULIN_APP_URL').replace(/\/$/, '');
const evidenceDirectory = requireEnv('YOULIN_EVIDENCE_DIR');
const person = JSON.parse(await readFile(requireEnv('YOULIN_PERSON_FILE'), 'utf8'));
const password = (await readFile(requireEnv('YOULIN_PASSWORD_FILE'), 'utf8')).replace(/\r?\n$/, '');
if (!appUrl.startsWith('http://127.0.0.1:')) throw new Error('ONLY_LOOPBACK_TARGETS');
await mkdir(evidenceDirectory, { recursive: true });

const redact = (value) =>
  String(value).replaceAll(password, '<redacted>').replaceAll(person.email, '<email>');
const save = async (file, contents) =>
  writeFile(`${evidenceDirectory}/${file}`, contents, { mode: 0o600 }).catch(() => {});

const events = [];
let browser;
let providerButtons = [];
let signinStatus;
let summary;
try {
  browser = await chromium.launch({ args: ['--disable-background-networking'], headless: true });
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    events.push({ kind: 'pageerror', text: redact(error.message).slice(0, 300) }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      events.push({ kind: 'console-error', text: redact(message.text()).slice(0, 300) });
  });
  page.on('requestfailed', (request) =>
    events.push({
      error: request.failure()?.errorText,
      kind: 'request-failed',
      url: redact(request.url()).slice(0, 220),
    }),
  );
  page.on('response', (response) =>
    events.push({ kind: 'http', status: response.status(), url: redact(response.url()).slice(0, 220) }),
  );
  // Log every request too: a client-side abort or a blocked POST otherwise leaves no trace.
  page.on('request', (request) =>
    events.push({ kind: 'request', method: request.method(), url: redact(request.url()).slice(0, 220) }),
  );

  signinStatus = (
    await page.goto(`${appUrl}/signin`, { timeout: 60_000, waitUntil: 'domcontentloaded' })
  )?.status();
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/01-signin.png` });
  providerButtons = (await page.locator('button').allInnerTexts()).map((text) =>
    redact(text).slice(0, 80),
  );
  await save('signin-buttons.json', `${JSON.stringify(providerButtons, null, 2)}\n`);
  await save('signin-html.html', await page.content());

  // Prefer a real click; fall back to the app's own sign-in endpoint (still a real OIDC redirect).
  // Match the provider explicitly: a loose /sso/i filter also matches "English" (Engli-sh), which
  // silently switched the locale instead of starting the OIDC redirect.
  const button = page.locator('button').filter({ hasText: /Keycloak/i }).first();
  if (await button.count()) {
    await save(
      'button-state.json',
      `${JSON.stringify(
        {
          count: await button.count(),
          disabled: await button.isDisabled().catch(() => null),
          outerHTML: (await button.evaluate((node) => node.outerHTML).catch(() => '')).slice(0, 400),
          visible: await button.isVisible().catch(() => null),
        },
        null,
        2,
      )}\n`,
    );
    await button.click({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    // The SPA gates SSO behind a terms/privacy consent modal; without accepting it the click only
    // opens the dialog and no OIDC request is ever sent.
    const agree = page
      .locator('button')
      .filter({ hasText: /同意并继续|Agree and continue/i })
      .first();
    await save('consent-visible.json', `${JSON.stringify({ count: await agree.count() })}\n`);
    if (await agree.count()) await agree.click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    await save(
      'after-click.json',
      `${JSON.stringify(
        { bodyText: redact(await page.locator('body').innerText().catch(() => '')).slice(0, 600), url: redact(page.url()) },
        null,
        2,
      )}\n`,
    );
    await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/01b-after-click.png` });
  } else
    await page.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/auth/sign-in/oauth2`, {
        body: JSON.stringify({ providerId: 'keycloak' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const { url } = await response.json();
      window.location.assign(url);
    }, appUrl);
  await page.waitForURL(/\/realms\//, { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  const idpUrl = page.url();
  if (!idpUrl.includes('/realms/')) throw new Error(`IDP_LOGIN_NOT_REACHED: ${redact(idpUrl)}`);
  await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/02-idp-login.png` });

  await page.fill('#username', person.email);
  await page.fill('#password', password);
  await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/03-credentials-entered.png` });
  await page.click('#kc-login');
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const finalUrl = page.url();
  const stillOnIdp = finalUrl.includes('/realms/');
  const idpErrorText = stillOnIdp
    ? redact(
        await page
          .locator('.pf-m-error, #input-error, .alert-error')
          .first()
          .innerText()
          .catch(() => ''),
      )
    : '';
  await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/04-after-login.png` });

  // Ask the product for its own session; only a proof-bound session authorizes later requests.
  const session = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/api/auth/get-session`, { credentials: 'include' });
    return { body: await response.json().catch(() => null), status: response.status };
  }, appUrl);
  const sessionUser = session.body?.user;
  await page.screenshot({ fullPage: true, path: `${evidenceDirectory}/05-final.png` });
  summary = {
    acceptance: 'not_published',
    idpErrorText: idpErrorText.slice(0, 200),
    idpUrlReached: idpUrl.split('?')[0],
    providerButtons: providerButtons.slice(0, 8),
    sessionEstablished: Boolean(sessionUser?.id && session.body?.session?.id),
    sessionStatus: session.status,
    signinStatus,
    stillOnIdp,
    title: await page.title(),
    url: redact(finalUrl),
    userEmailMatchesPerson: sessionUser?.email === person.email,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.sessionEstablished) process.exitCode = 2;
} catch (error) {
  console.log(
    JSON.stringify(
      {
        error: redact(error instanceof Error ? error.message : String(error)).slice(0, 300),
        providerButtons: providerButtons.slice(0, 8),
        signinStatus,
      },
      null,
      2,
    ),
  );
  process.exitCode = 3;
} finally {
  // Diagnostics must survive a failed run: they are the only record of what the page did.
  await save('events.json', `${JSON.stringify(events, null, 2)}\n`);
  if (browser) await browser.close();
}
