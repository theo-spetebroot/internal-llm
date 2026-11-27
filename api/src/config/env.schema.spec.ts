import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { envSchema, validateEnv } from './env.schema.js';

/** Variables of api/.env.example that the schema does not know: only the tests read them. */
const TEST_ONLY_VARIABLES = ['TEST_DATABASE_URL'];

const example = parseEnv(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'));

describe('api/.env.example', () => {
  it('lists exactly the variables of the env schema, plus the test-only ones', () => {
    expect(Object.keys(example).sort()).toEqual(
      [...Object.keys(envSchema.shape), ...TEST_ONLY_VARIABLES].sort(),
    );
  });

  it('is a valid configuration as it is, so that it works unchanged in local development', () => {
    expect(() => validateEnv(example)).not.toThrow();
  });
});

describe('LOG_LEVEL', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
  };
  const parse = (value?: string) =>
    envSchema.safeParse(value === undefined ? baseEnv : { ...baseEnv, LOG_LEVEL: value });

  it('defaults to info', () => {
    expect(parse().data?.LOG_LEVEL).toBe('info');
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])('accepts %s', (level) => {
    expect(parse(level).data?.LOG_LEVEL).toBe(level);
  });

  it.each(['', 'INFO', 'verbose', 'warning'])('refuses %j', (level) => {
    expect(parse(level).success).toBe(false);
  });
});
