import { Inject, Injectable } from '@nestjs/common';

import { raceAbort } from './abort.utils.js';
import { isNetworkError, LlmError } from './llm.errors.js';
import type { LlmMessage, LlmProvider } from './llm.types.js';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const LLM_OPTIONS = Symbol('LLM_OPTIONS');

export interface LlmOptions {
  /** Use the provider's streaming API when it has one. */
  stream: boolean;
  /**
   * Non-streaming: maximum duration of the whole call.
   * Streaming: maximum silence before the first token and between two tokens, so that a long
   * answer that keeps progressing is never cut.
   */
  timeoutMs: number;
  /** Prepended to every conversation; not stored in the database. */
  systemPrompt?: string | undefined;
}

class LlmTimeoutSignal extends Error {}

/**
 * Single entry point of the LLM layer for the rest of the app. On top of the configured
 * provider it handles: streaming vs one-shot mode, timeouts, cancellation and error
 * normalisation (`LlmError`). Natural place to plug LLM logs and stats later.
 */
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(LLM_OPTIONS) private readonly options: LlmOptions,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Yields the answer as text deltas: many small ones when streaming, a single one otherwise.
   * Callers handle both modes identically. Throws `LlmError` on failure.
   */
  async *generate(history: LlmMessage[], clientSignal: AbortSignal): AsyncGenerator<string> {
    const messages = this.withSystemPrompt(history);
    const controller = new AbortController();
    const forwardAbort = (): void => {
      controller.abort(clientSignal.reason);
    };
    clientSignal.addEventListener('abort', forwardAbort, { once: true });

    let timer: NodeJS.Timeout | undefined;
    const armTimeout = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort(new LlmTimeoutSignal());
      }, this.options.timeoutMs);
    };

    try {
      armTimeout();
      if (this.options.stream && this.provider.chatStream) {
        const tokens = this.provider.chatStream(messages, { signal: controller.signal });
        const iterator = tokens[Symbol.asyncIterator]();
        try {
          for (;;) {
            const result = await raceAbort(iterator.next(), controller.signal);
            if (result.done) break;
            armTimeout();
            yield result.value;
          }
        } finally {
          // Lets the provider release its resources (HTTP stream…) on early exit.
          void iterator.return?.();
        }
      } else {
        yield await raceAbort(
          this.provider.chat(messages, { signal: controller.signal }),
          controller.signal,
        );
      }
    } catch (error) {
      throw this.normalizeError(error, clientSignal, controller.signal);
    } finally {
      clearTimeout(timer);
      clientSignal.removeEventListener('abort', forwardAbort);
    }
  }

  private withSystemPrompt(history: LlmMessage[]): LlmMessage[] {
    const { systemPrompt } = this.options;
    return systemPrompt ? [{ role: 'system', content: systemPrompt }, ...history] : history;
  }

  private normalizeError(error: unknown, client: AbortSignal, internal: AbortSignal): LlmError {
    if (client.aborted) return new LlmError('LLM_ABORTED', undefined, { cause: error });
    if (internal.reason instanceof LlmTimeoutSignal) {
      return new LlmError('LLM_TIMEOUT', undefined, { cause: error });
    }
    if (error instanceof LlmError) return error;
    if (isNetworkError(error)) return new LlmError('LLM_UNAVAILABLE', undefined, { cause: error });
    return new LlmError('LLM_ERROR', undefined, { cause: error });
  }
}
