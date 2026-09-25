/**
 * Local-test chat driver: logs in through the real OIDC flow, then calls the product's own
 * `/webapi/chat/<provider>` endpoint from the authenticated page context so the session cookie and
 * the enterprise session-proof enforcement are exercised exactly as a browser would. It never
 * forges cookies, never writes to the database and never takes credentials from argv; the person
 * and password come from mounted 0600 files and are never printed. Output is diagnostic only and is
 * NOT product acceptance evidence.
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
const provider = process.env.YOULIN_CHAT_PROVIDER || 'openai';
const model = process.env.YOULIN_CHAT_MODEL || 'qwen3.8-max';
const person = JSON.parse(await readFile(requireEnv('YOULIN_PERSON_FILE'), 'utf8'));
const password = (await readFile(requireEnv('YOULIN_PASSWORD_FILE'), 'utf8')).replace(/\r?\n$/, '');
if (!appUrl.startsWith('http://127.0.0.1:')) throw new Error('ONLY_LOOPBACK_TARGETS');
await mkdir(evidenceDirectory, { recursive: true });

const redact = (value) =>
  String(value).replaceAll(password, '<redacted>').replaceAll(person.email, '<email>');
const save = async (file, contents) =>
  writeFile(`${evidenceDirectory}/${file}`, contents, { mode: 0o600 }).catch(() => {});

const summary = { model, provider };
let browser;
try {
  browser = await chromium.launch({ args: ['--disable-background-networking'], headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();

  await page.goto(`${appUrl}/signin`, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const button = page.locator('button').filter({ hasText: /Keycloak/i }).first();
  if (!(await button.count())) throw new Error('SSO_BUTTON_MISSING');
  await button.click({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  const agree = page.locator('button').filter({ hasText: /同意并继续|Agree and continue/i }).first();
  if (await agree.count()) await agree.click({ timeout: 15_000 });
  await page.waitForURL(/\/realms\//, { timeout: 45_000 });
  await page.fill('#username', person.email);
  await page.fill('#password', password);
  await page.click('#kc-login');
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (page.url().includes('/realms/')) throw new Error('STILL_ON_IDP');

  summary.sessionStatus = await page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session');
    return response.status;
  });

  // One real turn through the product endpoint. The prompt is deliberately tiny; the point is the
  // server-side usage tap, not the answer.
  summary.chat = await page.evaluate(
    async ({ model, provider }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`/webapi/chat/${provider}`, {
          body: JSON.stringify({
            messages: [{ content: '只回复一个字：好', role: 'user' }],
            model,
            stream: true,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });
        const text = await response.text();
        const usageMatch = text.match(/"usage"\s*:\s*\{[^}]*\}/);
        return {
          bytes: text.length,
          // Denials are JSON with a fixed reason code; surface it without echoing stream content.
          errorBody: response.ok ? null : text.slice(0, 240),
          status: response.status,
          usageChunkSeen: Boolean(usageMatch),
          usageShape: usageMatch ? usageMatch[0].slice(0, 220) : null,
        };
      } catch (error) {
        return { error: String(error?.message ?? error).slice(0, 160) };
      } finally {
        clearTimeout(timer);
      }
    },
    { model, provider },
  );

  await save('chat-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, acceptance: 'not_published' }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ error: redact(error?.message ?? String(error)).slice(0, 300), ...summary }));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
