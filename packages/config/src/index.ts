import { z } from 'zod';

/** Server configuration, validated once at boot. Never import this from browser code. */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  webOrigin: string;
  cookieSecure: boolean;
  logLevel: string;
  storage: StorageConfig;
  /** Where daily exchange rates come from (D-020): the public ECB-based service, fixed test rates, or none. */
  fx: { provider: 'frankfurter' | 'fixed' | 'off' };
  /** Invite and reset emails: SMTP (any provider), written to the log (development), or not sent. */
  email: EmailConfig;
  /** Built website to serve from the API (one-host deployment, e.g. Render); unset when a dev server or host serves it. */
  webDistDir?: string;
  /** D-033: create this Admin at startup when the database has none (hosts without a shell, e.g. Render free). */
  firstAdmin?: { email: string; name: string; password: string };
  /** D-051: ping this URL on a timer so a free host (Render) does not put the service to sleep. */
  keepAwake?: { url: string; everyMs: number };
}

export type EmailConfig =
  | { transport: 'log' | 'off'; from: string }
  /** D-032: Brevo's HTTPS API, for hosts that block SMTP ports (Render's free plan). */
  | { transport: 'brevo'; from: string; brevo: { apiKey: string } }
  | { transport: 'smtp'; from: string; smtp: { host: string; port: number; secure: boolean; user?: string; pass?: string } };

export type StorageConfig =
  | { driver: 'local'; localDir: string }
  | { driver: 's3'; endpoint?: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string };

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n  ${problems.join('\n  ')}`);
    this.name = 'ConfigError';
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  FX_PROVIDER: z.enum(['frankfurter', 'fixed', 'off']).default('frankfurter'),
  EMAIL_TRANSPORT: z.enum(['smtp', 'brevo', 'log', 'off']).default('log'),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).default('Project Management CRM <no-reply@localhost>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().min(1).default('./uploads'),
  S3_ENDPOINT: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  WEB_DIST_DIR: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  /** Set by Render on every web service. */
  RENDER_EXTERNAL_URL: z.url().optional(),
  KEEP_AWAKE_URL: z.url().optional(),
  KEEP_AWAKE: z.enum(['true', 'false']).default('true'),
});

// Values copied from examples or CI must never reach production.
const PLACEHOLDER_SECRET = /ci-only|change-me|test-only/i;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = parsed.data;
  const config: AppConfig = {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    webOrigin: e.WEB_ORIGIN.replace(/\/$/, ''),
    cookieSecure: e.COOKIE_SECURE === 'true',
    logLevel: e.LOG_LEVEL,
    storage: storageFrom(e),
    fx: { provider: e.FX_PROVIDER },
    email: emailFrom(e),
    ...(e.WEB_DIST_DIR ? { webDistDir: e.WEB_DIST_DIR } : {}),
    ...firstAdminFrom(e),
    ...keepAwakeFrom(e),
  };
  if (config.nodeEnv === 'production') {
    const problems: string[] = [];
    if (!config.cookieSecure) problems.push('COOKIE_SECURE: must be true in production');
    if (PLACEHOLDER_SECRET.test(config.sessionSecret)) problems.push('SESSION_SECRET: placeholder value in production');
    // Local disk is lost on redeploy and is not shared between instances.
    if (config.storage.driver === 'local') problems.push('STORAGE_DRIVER: use s3 (S3 / R2 bucket) in production');
    if (problems.length) throw new ConfigError(problems);
  }
  return config;
}

/** D-051: every 10 minutes, under Render's 15 idle minutes; the health URL does not touch the database. */
function keepAwakeFrom(e: z.infer<typeof envSchema>): Pick<AppConfig, 'keepAwake'> {
  if (e.KEEP_AWAKE === 'false') return {};
  const url = e.KEEP_AWAKE_URL ?? (e.RENDER_EXTERNAL_URL ? `${e.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/api/v1/health` : undefined);
  return url ? { keepAwake: { url, everyMs: 10 * 60_000 } } : {};
}

function firstAdminFrom(e: z.infer<typeof envSchema>): Pick<AppConfig, 'firstAdmin'> {
  const keys = ['ADMIN_EMAIL', 'ADMIN_NAME', 'ADMIN_PASSWORD'] as const;
  const missing = keys.filter((k) => !e[k]);
  if (missing.length === keys.length) return {};
  if (missing.length) throw new ConfigError(missing.map((k) => `${k}: required with the other ADMIN_* settings`));
  return { firstAdmin: { email: e.ADMIN_EMAIL!, name: e.ADMIN_NAME!, password: e.ADMIN_PASSWORD! } };
}

function emailFrom(e: z.infer<typeof envSchema>): EmailConfig {
  if (e.EMAIL_TRANSPORT === 'brevo') {
    if (!e.BREVO_API_KEY) throw new ConfigError(['BREVO_API_KEY: required when EMAIL_TRANSPORT=brevo']);
    return { transport: 'brevo', from: e.EMAIL_FROM, brevo: { apiKey: e.BREVO_API_KEY } };
  }
  if (e.EMAIL_TRANSPORT !== 'smtp') return { transport: e.EMAIL_TRANSPORT, from: e.EMAIL_FROM };
  if (!e.SMTP_HOST) throw new ConfigError(['SMTP_HOST: required when EMAIL_TRANSPORT=smtp']);
  return {
    transport: 'smtp',
    from: e.EMAIL_FROM,
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE === 'true',
      ...(e.SMTP_USER ? { user: e.SMTP_USER } : {}),
      ...(e.SMTP_PASS ? { pass: e.SMTP_PASS } : {}),
    },
  };
}

function storageFrom(e: z.infer<typeof envSchema>): StorageConfig {
  if (e.STORAGE_DRIVER === 'local') return { driver: 'local', localDir: e.STORAGE_LOCAL_DIR };
  const missing = (['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter((k) => !e[k]);
  if (missing.length) throw new ConfigError(missing.map((k) => `${k}: required when STORAGE_DRIVER=s3`));
  return {
    driver: 's3',
    ...(e.S3_ENDPOINT ? { endpoint: e.S3_ENDPOINT } : {}),
    bucket: e.S3_BUCKET!,
    region: e.S3_REGION,
    accessKeyId: e.S3_ACCESS_KEY_ID!,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
  };
}
