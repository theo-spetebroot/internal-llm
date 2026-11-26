import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';
import { LlmCallRecorder } from './llm-call.recorder.js';
import { llmProviderFactories } from './llm-provider.registry.js';
import type { LlmProvider } from './llm.types.js';
import { LLM_OPTIONS, LLM_PROVIDER, type LlmOptions, LlmService } from './llm.service.js';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmProvider =>
        llmProviderFactories[config.get('LLM_PROVIDER', { infer: true })](config),
    },
    {
      provide: LLM_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmOptions => ({
        stream: config.get('LLM_STREAM', { infer: true }),
        timeoutMs: config.get('LLM_TIMEOUT_MS', { infer: true }),
        systemPrompt: config.get('LLM_SYSTEM_PROMPT', { infer: true }),
      }),
    },
    LlmService,
    LlmCallRecorder,
  ],
  exports: [LlmService],
})
export class LlmModule {}
