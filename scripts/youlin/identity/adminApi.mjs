/**
 * Local-test driver for the model governance operator API. Logs in through the real OIDC flow,
 * then exercises GET/PUT /webapi/youlin/admin/model-access from the authenticated page context and
 * proves the write changes real enforcement: disable the model -> chat refused, re-enable -> chat
 * allowed. Credentials come only from mounted 0600 files and are never printed. Diagnostic only,
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
const model = process.env.YOULIN_CHAT_MODEL || 'qwen3.8-max';
const provider = process.env.YOULIN_CHAT_PROVIDER || 'openai';
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
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  await page.goto(`${appUrl}/signin`, { timeout: 90_000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const button = page
    .locator('button')
    .filter({ hasText: /Keycloak/i })
    .first();
  if (!(await button.count())) throw new Error('SSO_BUTTON_MISSING');
  await button.click({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  const agree = page
    .locator('button')
    .filter({ hasText: /同意并继续|Agree and continue/i })
    .first();
  if (await agree.count()) await agree.click({ timeout: 20_000 });
  await page.waitForURL(/\/realms\//, { timeout: 60_000 });
  await page.fill('#username', person.email);
  await page.fill('#password', password);
  await page.click('#kc-login');
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (page.url().includes('/realms/')) throw new Error('STILL_ON_IDP');

  summary.result = await page.evaluate(
    async ({ model, provider }) => {
      const out = {};
      const session = await fetch('/api/auth/get-session').then((r) => r.json());
      out.userId = session?.user?.id ?? null;
      out.sessionStatus = session?.user?.id ? 200 : 401;
      const api = '/webapi/youlin/admin/model-access';
      const get = await fetch(`${api}?userId=${encodeURIComponent(out.userId ?? '')}`);
      out.getStatus = get.status;
      const getBody = await get.json().catch(() => null);
      out.grantCount = Array.isArray(getBody?.grants) ? getBody.grants.length : null;
      out.periodId = getBody?.usage?.periodId ?? null;
      out.totalTokens = getBody?.usage?.totalTokens ?? null;

      const chat = async () => {
        const response = await fetch(`/webapi/chat/${provider}`, {
          body: JSON.stringify({
            messages: [{ content: '只回复一个字：好', role: 'user' }],
            model,
            stream: true,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        const text = await response.text();
        return { status: response.status, body: response.ok ? null : text.slice(0, 160) };
      };
      const put = async (grant) => {
        const response = await fetch(api, {
          body: JSON.stringify({ grant, userId: out.userId }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      };

      out.disable = await put({ enabled: false, model, monthlyTokenLimit: 100000 });
      out.chatWhileDisabled = await chat();
      out.enable = await put({ enabled: true, model, monthlyTokenLimit: 100000 });
      out.chatWhileEnabled = await chat();
      // A body that names an actor must be rejected rather than ignored.
      out.actorSpoof = await fetch(api, {
        body: JSON.stringify({
          actor: 'someone-else',
          grant: { enabled: true, model },
          userId: out.userId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }).then((r) => r.status);
      const after = await fetch(`${api}?userId=${encodeURIComponent(out.userId ?? '')}`).then((r) =>
        r.json(),
      );
      out.grantsAfter = Array.isArray(after?.grants) ? after.grants : null;
      return out;
    },
    { model, provider },
  );
  await save('admin-api-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, acceptance: 'not_published' }, null, 2));
} catch (error) {
  console.log(
    JSON.stringify({ ...summary, error: redact(error?.message ?? String(error)).slice(0, 300) }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
