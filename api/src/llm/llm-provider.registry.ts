import type { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';
import type { LlmProvider } from './llm.types.js';
import { MockLlmProvider } from './providers/mock.provider.js';

/** Names accepted by the LLM_PROVIDER environment variable. */
export const LLM_PROVIDER_NAMES = ['mock'] as const;

export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

type LlmProviderFactory = (config: ConfigService<Env, true>) => LlmProvider;

/**
 * One factory per provider. To support a new LLM API:
 *   1. implement `LlmProvider` in `providers/`,
 *   2. add its name to `LLM_PROVIDER_NAMES` and its factory below
 *      (the `Record` type makes a missing factory a compile error),
 *   3. add its specific settings (base URL, model…) to `config/env.schema.ts`.
 */
export const llmProviderFactories: Record<LlmProviderName, LlmProviderFactory> = {
  mock: () => new MockLlmProvider(),
};
