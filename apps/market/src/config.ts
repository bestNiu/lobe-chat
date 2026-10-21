import { z } from 'zod';

/**
 * Runtime configuration for the internal market service.
 *
 * `MARKET_TRUSTED_CLIENT_SECRET` must be exactly 83 characters because the
 * LobeHub side validates it with `z.string().length(83)` before deriving the
 * AES-256-GCM key (`lobehub-market_tcs_` + 64 hex chars). A shorter secret here
 * would start fine but every token from the app would fail to decrypt.
 */
const booleanFlag = z
  .enum(['0', '1'])
  .default('0')
  .transform((value) => value === '1');

const csvList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8789),

  DATABASE_URL: z.string().min(1).optional(),

  /** Upstream market this proxy fronts. */
  UPSTREAM_MARKET_URL: z.url().default('https://market.lobehub.com'),

  /**
   * Base URL browsers use to reach this proxy. Snapshot items embed it in
   * `manifestUrl`, so it must be reachable from the user's machine — not the
   * compose-internal hostname the app uses.
   */
  MARKET_PUBLIC_BASE_URL: z.url().default('http://localhost:33220'),

  /** Where M2M credentials and snapshots live. */
  M2M_STATE_PATH: z.string().default('/data/m2m-client.json'),
  SNAPSHOT_DIR: z.string().default('/data/snapshot'),
  SNAPSHOT_ENABLED: z
    .enum(['0', '1'])
    .default('1')
    .transform((value) => value === '1'),
  SNAPSHOT_PER_CATEGORY: z.coerce.number().int().min(1).max(100).default(100),
  SNAPSHOT_PREFETCH_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  SNAPSHOT_AGENTS_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(10 * 60 * 1000),
  SNAPSHOT_PLUGINS_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(30 * 60 * 1000),
  SNAPSHOT_SKILLS_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(60 * 60 * 1000),

  MARKET_TRUSTED_CLIENT_ID: z.string().min(1),
  MARKET_TRUSTED_CLIENT_SECRET: z.string().length(83),

  S3_INTERNAL_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_BUCKET: z.string().default('market'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Who may review submissions. Seeded into `market_reviewers` on first boot. */
  MARKET_REVIEWER_EMAILS: csvList,

  /** stdio MCP is out of scope for this delivery; keep it off. */
  MCP_ALLOW_STDIO: booleanFlag,

  /** `redirect` sends the browser to GitHub; `stream` proxies the archive. */
  SKILL_DOWNLOAD_PROXY_MODE: z.enum(['redirect', 'stream']).default('redirect'),

  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
});

export type MarketConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(issues: string[]) {
    super(`Invalid market service configuration:\n${issues.join('\n')}`);
    this.name = 'ConfigError';
  }
}

export const loadConfig = (env: Record<string, string | undefined> = process.env): MarketConfig => {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return parsed.data;
};

let cached: MarketConfig | undefined;

/** Lazily resolved so importing this module never throws in tooling/tests. */
export const getConfig = (): MarketConfig => {
  cached ??= loadConfig();

  return cached;
};

/** Test seam: inject a config without touching `process.env`. */
export const setConfigForTest = (config: MarketConfig | undefined) => {
  cached = config;
};
