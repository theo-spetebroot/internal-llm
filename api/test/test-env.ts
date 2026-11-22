import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Environment of the test runs. Tests use a dedicated database (`llmchat_test`) on the
 * development PostgreSQL server, created and migrated by `global-setup.ts`.
 */

/**
 * TEST_DATABASE_URL from the process environment (CI), else from api/.env (local, e.g. when
 * PostgreSQL runs on another port), else the default development server. api/.env is parsed
 * without being loaded, so its other variables never leak into the test environment.
 */
function resolveTestDatabaseUrl(): string {
  const fromProcess = process.env['TEST_DATABASE_URL'];
  if (fromProcess) return fromProcess;

  const envFile = new URL('../.env', import.meta.url);
  if (existsSync(envFile)) {
    const fromFile = parseEnv(readFileSync(envFile, 'utf8'))['TEST_DATABASE_URL'];
    if (fromFile) return fromFile;
  }

  return 'postgresql://llmchat:llmchat@localhost:5432/llmchat_test';
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
  JWT_EXPIRES_IN_SECONDS: '3600',
  COOKIE_SECURE: 'false',
  // Small limit so that validation tests stay cheap.
  MAX_MESSAGE_LENGTH: '100',
} as const;
