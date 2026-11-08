import { Global, Module } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  host: string;
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  swaggerEnabled: boolean;
  rateLimitPerMinute: number;
  askRateLimitPerMinute: number;
  /** Delay between streamed words on /v1/ask. 0 = as fast as possible. */
  askTokenDelayMs: number;
  corsOrigins: string[];
  /** Trust X-Forwarded-For. Only turn on behind a proxy you control. */
  trustProxy: boolean;
  logLevels: LogLevel[];
}

const LOG_LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

/**
 * Reads and checks every setting up front, so a typo fails at start-up with a
 * clear message instead of misbehaving later. Every setting has a default.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  const text = (name: string, fallback: string): string => {
    const v = env[name]?.trim();
    return v ? v : fallback;
  };
  const int = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be a whole number from ${min} to ${max}, got "${raw}".`);
      return fallback;
    }
    return n;
  };
  const bool = (name: string, fallback: boolean): boolean => {
    const raw = env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (['true', '1', 'yes'].includes(raw)) return true;
    if (['false', '0', 'no'].includes(raw)) return false;
    problems.push(`${name} must be true or false, got "${env[name]}".`);
    return fallback;
  };

  const nodeEnvRaw = text('NODE_ENV', 'development');
  let nodeEnv: AppConfig['nodeEnv'] = 'development';
  if (['development', 'production', 'test'].includes(nodeEnvRaw)) {
    nodeEnv = nodeEnvRaw as AppConfig['nodeEnv'];
  } else {
    problems.push(
      `NODE_ENV must be development, production or test, got "${nodeEnvRaw}".`,
    );
  }

  const levelRaw = text('LOG_LEVEL', 'log');
  let logLevels: LogLevel[] = LOG_LEVELS.slice(0, LOG_LEVELS.indexOf('log') + 1);
  const at = LOG_LEVELS.indexOf(levelRaw as LogLevel);
  if (at === -1) {
    problems.push(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${levelRaw}".`,
    );
  } else {
    logLevels = LOG_LEVELS.slice(0, at + 1);
  }

  const corsOrigins = text('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    try {
      const u = new URL(origin);
      if (u.origin !== origin) throw new Error('not an origin');
    } catch {
      problems.push(
        `CORS_ORIGINS has "${origin}", which is not an origin like https://example.com (no path, no trailing slash).`,
      );
    }
  }

  const config: AppConfig = {
    host: text('HOST', '127.0.0.1'),
    port: int('PORT', 3000, 0, 65535),
    nodeEnv,
    swaggerEnabled: bool('SWAGGER_ENABLED', nodeEnv !== 'production'),
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 60, 1, 100_000),
    askRateLimitPerMinute: int('ASK_RATE_LIMIT_PER_MINUTE', 10, 1, 100_000),
    askTokenDelayMs: int('ASK_TOKEN_DELAY_MS', nodeEnv === 'test' ? 0 : 15, 0, 1000),
    corsOrigins,
    trustProxy: bool('TRUST_PROXY', false),
    logLevels,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig) {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
