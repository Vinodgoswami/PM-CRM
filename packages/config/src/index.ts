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
}

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
  STORAGE_LOCAL_DIR: z.string().min(1).default('./uploads'),
  S3_ENDPOINT: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
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
