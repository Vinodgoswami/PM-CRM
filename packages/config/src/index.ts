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
}

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
  };
  if (config.nodeEnv === 'production') {
    const problems: string[] = [];
    if (!config.cookieSecure) problems.push('COOKIE_SECURE: must be true in production');
    if (PLACEHOLDER_SECRET.test(config.sessionSecret)) problems.push('SESSION_SECRET: placeholder value in production');
    if (problems.length) throw new ConfigError(problems);
  }
  return config;
}
