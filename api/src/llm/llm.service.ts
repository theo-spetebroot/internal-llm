import { Inject, Injectable, Logger } from '@nestjs/common';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import { raceAbort } from './abort.utils.js';
import { isNetworkError, LlmError } from './llm.errors.js';
import { type LlmCallRecord, LlmCallRecorder } from './llm-call.recorder.js';
import type { LlmMessage, LlmProvider, LlmUsage, TokenUsage } from './llm.types.js';
import { estimateMessagesTokens, estimateTokens } from './token-estimator.js';

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
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(LLM_OPTIONS) private readonly options: LlmOptions,
    private readonly recorder: LlmCallRecorder,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Token usage of a call that did not complete, estimated from the text received so far.
   * `history` is what `generate` received: the system prompt is added here, as it is there.
   */
  estimateUsage(history: LlmMessage[], answer: string): TokenUsage {
    return this.estimate(this.withSystemPrompt(history), answer);
  }

  /** `messages` is what the provider receives, system prompt included. */
  private estimate(messages: LlmMessage[], answer: string): TokenUsage {
    return {
      promptTokens: estimateMessagesTokens(messages),
      completionTokens: estimateTokens(answer),
      estimated: true,
    };
  }

  /**
   * Token usage recorded for a call that did not complete: estimated from the prompt and the
   * text received so far, which is empty when no token came back (the model server received
   * the prompt, so the prompt counts and the answer is 0). The only call without a figure
   * (`null`) is the one that never reached the model server: `LLM_UNAVAILABLE` with no text
   * received (a connection dropped mid-answer did reach it).
   */
  private usageOfUnfinishedCall(
    messages: LlmMessage[],
    answer: string,
    errorCode: string | null,
  ): TokenUsage | null {
    if (answer === '' && errorCode === 'LLM_UNAVAILABLE') return null;
    return this.estimate(messages, answer);
  }

  /**
   * Yields the answer as text deltas: many small ones when streaming, a single one otherwise.
   * Callers handle both modes identically. Throws `LlmError` on failure.
   * Exactly one call record is written when the call ends, whatever the outcome.
   *
   * Once the answer is complete, the generator returns its token usage: the provider's own
   * figures when it reports them, an estimate (flagged as such) otherwise.
   */
  async *generate(
    history: LlmMessage[],
    clientSignal: AbortSignal,
    context: LlmCallContext,
  ): AsyncGenerator<string, TokenUsage> {
    const messages = this.withSystemPrompt(history);
    const startedAt = new Date();
    const startedClock = performance.now();
    let answer = '';
    let reportedUsage: LlmUsage | undefined;
    // Only set once the call has completed.
    let completedUsage: TokenUsage | null = null;
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
            if (result.done) {
              reportedUsage = result.value;
              break;
            }
            armTimeout();
            markFirstToken();
            answer += result.value;
            yield result.value;
          }
        } finally {
          // Lets the provider release its resources (HTTP stream…) on early exit.
          void iterator.return(undefined);
        }
      } else {
        const { text, usage } = await raceAbort(
          this.provider.chat(messages, { signal: controller.signal }),
          controller.signal,
        );
        markFirstToken();
        answer = text;
        reportedUsage = usage;
        yield text;
      }
      outcome = LlmCallOutcome.COMPLETED;
      completedUsage = reportedUsage
        ? { ...reportedUsage, estimated: false }
        : this.estimate(messages, answer);
      return completedUsage;
    } catch (error) {
      const failure = this.normalizeError(error, clientSignal, controller.signal);
      const classified = this.classify(failure);
      outcome = classified.outcome;
      errorCode = classified.errorCode;
      throw failure;
    } finally {
      clearTimeout(timer);
      clientSignal.removeEventListener('abort', forwardAbort);
      const call: LlmCallRecord = {
        userId: context.userId,
        conversationId: context.conversationId,
        provider: this.provider.name,
        startedAt,
        durationMs: Math.round(performance.now() - startedClock),
        timeToFirstTokenMs,
        outcome: outcome ?? LlmCallOutcome.INTERRUPTED,
        errorCode,
        usage: completedUsage ?? this.usageOfUnfinishedCall(messages, answer, errorCode),
      };
      this.recorder.record(call);
      this.logCall(call);
    }
  }

  /** One line per call, tied to its request by the request id. Never the prompt or the answer. */
  private logCall(call: LlmCallRecord): void {
    const firstToken =
      call.timeToFirstTokenMs === null
        ? 'no token'
        : `first token after ${call.timeToFirstTokenMs} ms`;
    const message =
      `LLM call ${call.outcome} (provider ${call.provider}, ${call.durationMs} ms, ${firstToken}` +
      `${call.errorCode === null ? '' : `, ${call.errorCode}`})`;
    if (call.errorCode === null) this.logger.log(message);
    else this.logger.warn(message);
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
