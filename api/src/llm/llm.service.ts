import { Inject, Injectable } from '@nestjs/common';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import { raceAbort } from './abort.utils.js';
import { isNetworkError, LlmError } from './llm.errors.js';
import { LlmCallRecorder } from './llm-call.recorder.js';
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

/** Whose call it is, so that it can be recorded. */
export interface LlmCallContext {
  userId: string;
  conversationId: string;
}

class LlmTimeoutSignal extends Error {}

/**
 * Single entry point of the LLM layer for the rest of the app. On top of the configured
 * provider it handles: streaming vs one-shot mode, timeouts, cancellation, error
 * normalisation (`LlmError`) and the record of every call (`LlmCallRecorder`).
 */
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(LLM_OPTIONS) private readonly options: LlmOptions,
    private readonly recorder: LlmCallRecorder,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Yields the answer as text deltas: many small ones when streaming, a single one otherwise.
   * Callers handle both modes identically. Throws `LlmError` on failure.
   * Exactly one call record is written when the call ends, whatever the outcome.
   */
  async *generate(
    history: LlmMessage[],
    clientSignal: AbortSignal,
    context: LlmCallContext,
  ): AsyncGenerator<string> {
    const messages = this.withSystemPrompt(history);
    const startedAt = new Date();
    const startedClock = performance.now();
    let timeToFirstTokenMs: number | null = null;
    // Stays null when the consumer stops iterating early: recorded as interrupted.
    let outcome: LlmCallOutcome | null = null;
    let errorCode: string | null = null;

    const markFirstToken = (): void => {
      timeToFirstTokenMs ??= Math.round(performance.now() - startedClock);
    };

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
        const iterator = this.provider.chatStream(messages, { signal: controller.signal });
        try {
          for (;;) {
            const result = await raceAbort(iterator.next(), controller.signal);
            if (result.done) break;
            armTimeout();
            markFirstToken();
            yield result.value;
          }
        } finally {
          // Lets the provider release its resources (HTTP stream…) on early exit.
          void iterator.return(undefined);
        }
      } else {
        const { text } = await raceAbort(
          this.provider.chat(messages, { signal: controller.signal }),
          controller.signal,
        );
        markFirstToken();
        yield text;
      }
      outcome = LlmCallOutcome.COMPLETED;
    } catch (error) {
      const failure = this.normalizeError(error, clientSignal, controller.signal);
      const classified = this.classify(failure);
      outcome = classified.outcome;
      errorCode = classified.errorCode;
      throw failure;
    } finally {
      clearTimeout(timer);
      clientSignal.removeEventListener('abort', forwardAbort);
      this.recorder.record({
        userId: context.userId,
        conversationId: context.conversationId,
        provider: this.provider.name,
        startedAt,
        durationMs: Math.round(performance.now() - startedClock),
        timeToFirstTokenMs,
        outcome: outcome ?? LlmCallOutcome.INTERRUPTED,
        errorCode,
      });
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

  /** Outcome recorded for a failed call. An abort is not an error, so it carries no code. */
  private classify(failure: LlmError): { outcome: LlmCallOutcome; errorCode: string | null } {
    switch (failure.code) {
      case 'LLM_ABORTED':
        return { outcome: LlmCallOutcome.INTERRUPTED, errorCode: null };
      case 'LLM_TIMEOUT':
        return { outcome: LlmCallOutcome.TIMEOUT, errorCode: failure.code };
      default:
        return { outcome: LlmCallOutcome.ERROR, errorCode: failure.code };
    }
  }
}
