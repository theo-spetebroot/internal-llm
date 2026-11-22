/**
 * Environment of the test runs. Tests use a dedicated database (`llmchat_test`) on the
 * development PostgreSQL server, created and migrated by `global-setup.ts`.
 */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://llmchat:llmchat@localhost:5432/llmchat_test';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
  JWT_EXPIRES_IN_SECONDS: '3600',
  COOKIE_SECURE: 'false',
  // Small limit so that validation tests stay cheap.
  MAX_MESSAGE_LENGTH: '100',
} as const;
