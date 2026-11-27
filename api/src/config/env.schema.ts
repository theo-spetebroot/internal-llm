import { z } from 'zod';

import { LLM_PROVIDER_NAMES } from '../llm/llm-provider.registry.js';

/**
 * Single source of truth for the API configuration.
 * The app refuses to start when a variable is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /** Minimum level of the logs (`silent` turns them off). */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Secret used to sign session JWTs. Generate one with `openssl rand -base64 48`. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  /** Session lifetime, shared by the JWT and its cookie. Default: 7 days. */
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  /** Set to true once the app is served over HTTPS (cookie then only sent over TLS). */
  COOKIE_SECURE: z.stringbool().default(false),

  /** Which `LlmProvider` implementation answers (see llm/llm-provider.registry.ts). */
  LLM_PROVIDER: z.enum(LLM_PROVIDER_NAMES).default('mock'),
  /** Stream tokens when the provider supports it; otherwise wait for the full answer. */
  LLM_STREAM: z.stringbool().default(true),
  /** Full-call timeout (non-streaming) or max silence between tokens (streaming). */
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Maximum length of a user message, in characters. */
  MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(32_000),
  /** Optional system prompt prepended to every conversation. */
  LLM_SYSTEM_PROMPT: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  /**
   * Recorded LLM calls older than this many days are deleted by the daily purge. The upper
   * bound (10 years) only keeps the cut-off date a valid date.
   */
  LLM_CALL_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
