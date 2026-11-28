import { Logger } from '@nestjs/common';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import { LlmError, type LlmErrorCode } from './llm.errors.js';
import { type LlmCallContext, type LlmOptions, LlmService } from './llm.service.js';
import type { LlmCallRecorder, LlmCallRecord } from './llm-call.recorder.js';
import type {
  LlmMessage,
  LlmProvider,
  LlmRequestOptions,
  LlmUsage,
  TokenUsage,
} from './llm.types.js';

const history: LlmMessage[] = [{ role: 'user', content: 'Hi' }];
const defaults: LlmOptions = { stream: true, timeoutMs: 1_000 };
const context: LlmCallContext = { userId: 'user-1', conversationId: 'conversation-1' };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

interface FakeProvider extends LlmProvider {
  /** Messages received by each call, tagged with the method used. */
  calls: { method: 'chat' | 'chatStream'; messages: LlmMessage[] }[];
}

/**
 * Provider streaming `tokens` with `delayMs` between them (and the same text via chat()).
 * Reports `usage` in both modes when given, like a provider that knows the real figures.
 */
function fakeProvider(tokens: string[], delayMs = 0, usage?: LlmUsage): FakeProvider {
  const calls: FakeProvider['calls'] = [];
  return {
    name: 'fake',
    calls,
    chat(messages) {
      calls.push({ method: 'chat', messages });
      return Promise.resolve({ text: tokens.join(''), usage });
    },
    async *chatStream(messages): AsyncGenerator<string, LlmUsage | undefined> {
      calls.push({ method: 'chatStream', messages });
      for (const token of tokens) {
        await wait(delayMs);
        yield token;
      }
      return usage;
    },
  };
}

/** Recorder keeping the records in memory, in place of the database. */
const records: LlmCallRecord[] = [];
const recorder = {
  record: (call: LlmCallRecord): void => {
    records.push(call);
  },
} as unknown as LlmCallRecorder;

/** Service wired to the in-memory recorder. */
function newService(provider: LlmProvider, options: LlmOptions = defaults): LlmService {
  return new LlmService(provider, options, recorder);
}

async function collect(
  service: LlmService,
  signal = new AbortController().signal,
): Promise<string[]> {
  const deltas: string[] = [];
  for await (const delta of service.generate(history, signal, context)) deltas.push(delta);
  return deltas;
}

/** Consumes a whole call, returning the deltas and the usage the generator hands back. */
async function generateAll(
  service: LlmService,
  input: LlmMessage[] = history,
): Promise<{ deltas: string[]; usage: TokenUsage }> {
  const deltas: string[] = [];
  const generator = service.generate(input, new AbortController().signal, context);
  let step = await generator.next();
  while (!step.done) {
    deltas.push(step.value);
    step = await generator.next();
  }
  return { deltas, usage: step.value };
}

async function expectLlmError(promise: Promise<unknown>, code: LlmErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(LlmError);
  expect((error as LlmError).code).toBe(code);
}

beforeAll(() => {
  // The service logs each call: keep the test output clean.
  Logger.overrideLogger(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  records.length = 0;
});

describe('LlmService', () => {
  describe('modes', () => {
    it('yields one delta per token when streaming', async () => {
      const service = newService(fakeProvider(['Hel', 'lo', '!']));
      expect(await collect(service)).toEqual(['Hel', 'lo', '!']);
    });

    it('yields the full answer once when LLM_STREAM is off', async () => {
      const provider = fakeProvider(['Hel', 'lo', '!']);
      const service = newService(provider, { ...defaults, stream: false });

      expect(await collect(service)).toEqual(['Hello!']);
      expect(provider.calls.map((call) => call.method)).toEqual(['chat']);
    });

    it('falls back to chat() when the provider cannot stream', async () => {
      const oneShotProvider: LlmProvider = {
        name: 'one-shot',
        chat: () => Promise.resolve({ text: 'Hello' }),
      };
      const service = newService(oneShotProvider);
      expect(await collect(service)).toEqual(['Hello']);
    });
  });

  describe('system prompt', () => {
    it('is prepended when configured', async () => {
      const provider = fakeProvider(['ok']);
      await collect(newService(provider, { ...defaults, systemPrompt: 'Be concise.' }));
      expect(provider.calls[0]?.messages).toEqual([
        { role: 'system', content: 'Be concise.' },
        ...history,
      ]);
    });

    it('is omitted otherwise', async () => {
      const provider = fakeProvider(['ok']);
      await collect(newService(provider));
      expect(provider.calls[0]?.messages).toEqual(history);
    });
  });

  describe('token usage', () => {
    // 'Hi' is 1 token; 'Hello world!' (12 characters) is 3.
    const answer = ['Hello', ' world', '!'];
    const reported: LlmUsage = { promptTokens: 42, completionTokens: 7 };

    it('is estimated, and flagged as such, when the provider reports none (streaming)', async () => {
      const { usage } = await generateAll(newService(fakeProvider(answer)));
      expect(usage).toEqual({ promptTokens: 1, completionTokens: 3, estimated: true });
    });

    it('is estimated, and flagged as such, when the provider reports none (one-shot)', async () => {
      const service = newService(fakeProvider(answer), { ...defaults, stream: false });
      const { usage } = await generateAll(service);
      expect(usage).toEqual({ promptTokens: 1, completionTokens: 3, estimated: true });
    });

    it('counts the system prompt and the whole history in the estimated prompt tokens', async () => {
      const service = newService(fakeProvider(answer), {
        ...defaults,
        systemPrompt: 'a'.repeat(8),
      });
      const { usage } = await generateAll(service, [
        { role: 'user', content: 'a'.repeat(4) },
        { role: 'assistant', content: 'a'.repeat(4) },
        { role: 'user', content: 'a'.repeat(5) },
      ]);
      expect(usage.promptTokens).toBe(2 + 1 + 1 + 2);
    });

    it('prefers the figures reported by the provider (streaming)', async () => {
      const { usage } = await generateAll(newService(fakeProvider(answer, 0, reported)));
      expect(usage).toEqual({ ...reported, estimated: false });
    });

    it('prefers the figures reported by the provider (one-shot)', async () => {
      const service = newService(fakeProvider(answer, 0, reported), { ...defaults, stream: false });
      const { usage } = await generateAll(service);
      expect(usage).toEqual({ ...reported, estimated: false });
    });

    it('does not change the streamed text', async () => {
      const { deltas } = await generateAll(newService(fakeProvider(answer, 0, reported)));
      expect(deltas).toEqual(answer);
    });

    it('estimates the usage of a partial answer, system prompt included', () => {
      const service = newService(fakeProvider(answer), {
        ...defaults,
        systemPrompt: 'a'.repeat(8),
      });
      expect(service.estimateUsage(history, 'a'.repeat(9))).toEqual({
        promptTokens: 2 + 1,
        completionTokens: 3,
        estimated: true,
      });
    });
  });

  describe('token usage of the recorded call', () => {
    // 'Hi' is 1 token; 'aaaa' is 1 token, 'aaaaaaaa' is 2.
    const networkError = () =>
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      });
    const usageOfOnlyRecord = () => {
      expect(records).toHaveLength(1);
      return records[0]?.usage;
    };

    describe('completed calls', () => {
      it('records the estimate, flagged as such, when the provider reports nothing', async () => {
        await collect(newService(fakeProvider(['Hello', ' world', '!'])));

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 3,
          estimated: true,
        });
      });

      it('records the figures reported by the provider (streaming and one-shot)', async () => {
        const reported = { promptTokens: 42, completionTokens: 7 };

        await collect(newService(fakeProvider(['Hi'], 0, reported)));
        await collect(
          newService(fakeProvider(['Hi'], 0, reported), { ...defaults, stream: false }),
        );

        expect(records.map((record) => record.usage)).toEqual([
          { ...reported, estimated: false },
          { ...reported, estimated: false },
        ]);
      });
    });

    describe('calls that stopped after some text', () => {
      it('estimates the usage of the text received when the caller leaves', async () => {
        const provider: LlmProvider = {
          name: 'leaving',
          chat: () => never(),
          async *chatStream(): AsyncGenerator<string, undefined> {
            yield 'aaaa';
            await never();
          },
        };
        const controller = new AbortController();
        setTimeout(() => {
          controller.abort();
        }, 50);

        await expectLlmError(collect(newService(provider), controller.signal), 'LLM_ABORTED');

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 1,
          estimated: true,
        });
      });

      it('estimates the usage of the text received when the consumer stops iterating', async () => {
        const service = newService(fakeProvider(['aaaa', 'bbbb', 'cccc']));
        for await (const _delta of service.generate(
          history,
          new AbortController().signal,
          context,
        )) {
          break;
        }

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 1,
          estimated: true,
        });
      });

      it('estimates the usage of the text received when the model fails mid-answer', async () => {
        const provider: LlmProvider = {
          name: 'failing',
          chat: () => never(),
          async *chatStream(): AsyncGenerator<string, undefined> {
            await wait(0);
            yield 'aaaaaaaa';
            throw new Error('HTTP 500');
          },
        };

        await expectLlmError(collect(newService(provider)), 'LLM_ERROR');

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 2,
          estimated: true,
        });
      });

      it('does so even when the connection drops mid-answer: the server was reached', async () => {
        const provider: LlmProvider = {
          name: 'dropping',
          chat: () => never(),
          async *chatStream(): AsyncGenerator<string, undefined> {
            await wait(0);
            yield 'aaaa';
            throw networkError();
          },
        };

        await expectLlmError(collect(newService(provider)), 'LLM_UNAVAILABLE');

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 1,
          estimated: true,
        });
      });
    });

    describe('calls that stopped before any token', () => {
      it('counts the prompt, and no answer, when the model returns an error', async () => {
        const provider: LlmProvider = {
          name: 'broken',
          chat: () => Promise.reject(new Error('HTTP 500')),
        };

        await expectLlmError(
          collect(newService(provider, { ...defaults, stream: false })),
          'LLM_ERROR',
        );

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 0,
          estimated: true,
        });
      });

      it('counts the prompt, and no answer, on a timeout (one-shot)', async () => {
        const provider: LlmProvider = { name: 'stuck', chat: () => never() };

        await expectLlmError(
          collect(newService(provider, { ...defaults, stream: false, timeoutMs: 50 })),
          'LLM_TIMEOUT',
        );

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 0,
          estimated: true,
        });
      });

      it('counts the prompt, and no answer, on a timeout before the first token (streaming)', async () => {
        const provider: LlmProvider = {
          name: 'silent',
          chat: () => never(),
          async *chatStream(): AsyncGenerator<string, undefined> {
            await never();
            yield 'unreachable';
          },
        };

        await expectLlmError(
          collect(newService(provider, { ...defaults, timeoutMs: 50 })),
          'LLM_TIMEOUT',
        );

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 1,
          completionTokens: 0,
          estimated: true,
        });
      });

      it('counts the system prompt in the prompt tokens', async () => {
        const provider: LlmProvider = {
          name: 'broken',
          chat: () => Promise.reject(new Error('HTTP 500')),
        };
        const service = newService(provider, {
          ...defaults,
          stream: false,
          systemPrompt: 'a'.repeat(8),
        });

        await expectLlmError(collect(service), 'LLM_ERROR');

        expect(usageOfOnlyRecord()).toEqual({
          promptTokens: 2 + 1,
          completionTokens: 0,
          estimated: true,
        });
      });

      it('has no figure when nothing reached the model server (LLM_UNAVAILABLE)', async () => {
        const provider: LlmProvider = {
          name: 'down',
          chat: () => Promise.reject(networkError()),
        };

        await expectLlmError(
          collect(newService(provider, { ...defaults, stream: false })),
          'LLM_UNAVAILABLE',
        );

        expect(records[0]).toMatchObject({ errorCode: 'LLM_UNAVAILABLE', usage: null });
        expect(records).toHaveLength(1);
      });

      it('counts the prompt, and no answer, when the caller leaves before any token', async () => {
        const provider: LlmProvider = { name: 'slow', chat: () => never() };
        const controller = new AbortController();
        setTimeout(() => {
          controller.abort();
        }, 30);

        await expectLlmError(
          collect(newService(provider, { ...defaults, stream: false }), controller.signal),
          'LLM_ABORTED',
        );

        expect(records[0]).toMatchObject({
          outcome: LlmCallOutcome.INTERRUPTED,
          usage: { promptTokens: 1, completionTokens: 0, estimated: true },
        });
        expect(records).toHaveLength(1);
      });
    });
  });

  describe('timeouts', () => {
    it('times out a one-shot call that never answers, even if the provider ignores the signal', async () => {
      const provider: LlmProvider = { name: 'stuck', chat: () => never() };
      const service = newService(provider, { ...defaults, stream: false, timeoutMs: 50 });
      await expectLlmError(collect(service), 'LLM_TIMEOUT');
    });

    it('does not cut a stream that keeps progressing beyond the timeout', async () => {
      // 10 tokens × 20 ms = 200 ms total, but never more than 20 ms of silence.
      const tokens = Array.from({ length: 10 }, (_, i) => `t${i}`);
      const service = newService(fakeProvider(tokens, 20), { ...defaults, timeoutMs: 100 });
      expect(await collect(service)).toEqual(tokens);
    });

    it('times out a stream that stalls between two tokens', async () => {
      const provider: LlmProvider = {
        name: 'stalling',
        chat: () => never(),
        async *chatStream(): AsyncGenerator<string, undefined> {
          yield 'first';
          await never();
        },
      };
      const service = newService(provider, { ...defaults, timeoutMs: 50 });
      await expectLlmError(collect(service), 'LLM_TIMEOUT');
    });
  });

  describe('cancellation', () => {
    it('stops and reports LLM_ABORTED when the client aborts', async () => {
      let providerSignal: AbortSignal | undefined;
      const provider: LlmProvider = {
        name: 'slow',
        chat: () => never(),
        async *chatStream(_messages, { signal }: LlmRequestOptions) {
          providerSignal = signal;
          for (;;) {
            await wait(10);
            yield 'x';
          }
        },
      };
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 50);

      await expectLlmError(collect(newService(provider), controller.signal), 'LLM_ABORTED');
      expect(providerSignal?.aborted).toBe(true);
    });
  });

  describe('error normalisation', () => {
    it('maps connection failures to LLM_UNAVAILABLE', async () => {
      const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const provider: LlmProvider = {
        name: 'down',
        chat: () => Promise.reject(new TypeError('fetch failed', { cause: refused })),
      };
      const service = newService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_UNAVAILABLE');
    });

    it('maps unknown failures to LLM_ERROR', async () => {
      const provider: LlmProvider = {
        name: 'broken',
        chat: () => Promise.reject(new Error('HTTP 500')),
      };
      const service = newService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_ERROR');
    });

    it('keeps LlmError codes raised by the provider', async () => {
      const provider: LlmProvider = {
        name: 'explicit',
        chat: () => Promise.reject(new LlmError('LLM_UNAVAILABLE', 'model is loading')),
      };
      const service = newService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_UNAVAILABLE');
    });
  });

  describe('call records', () => {
    const streamingProvider = (): LlmProvider => fakeProvider(['Hel', 'lo']);

    it('writes one record per call, for the given user and conversation', async () => {
      await collect(newService(streamingProvider()));

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        userId: 'user-1',
        conversationId: 'conversation-1',
        provider: 'fake',
        outcome: LlmCallOutcome.COMPLETED,
        errorCode: null,
      });
    });

    it('records the timings of a completed call', async () => {
      await collect(newService(fakeProvider(['a', 'b'], 5)));

      const [record] = records;
      expect(record?.startedAt).toBeInstanceOf(Date);
      expect(record?.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
      expect(record?.durationMs).toBeGreaterThanOrEqual(record?.timeToFirstTokenMs ?? Infinity);
    });

    it('keeps only metadata and token counts: no prompt or answer text', async () => {
      await collect(newService(streamingProvider()));
      expect(Object.keys(records[0] ?? {}).sort()).toEqual(
        [
          'conversationId',
          'durationMs',
          'errorCode',
          'outcome',
          'provider',
          'startedAt',
          'timeToFirstTokenMs',
          'usage',
          'userId',
        ].sort(),
      );
      expect(Object.keys(records[0]?.usage ?? {}).sort()).toEqual(
        ['completionTokens', 'estimated', 'promptTokens'].sort(),
      );
    });

    it('records a provider failure as ERROR with its code', async () => {
      const provider: LlmProvider = {
        name: 'broken',
        chat: () => Promise.reject(new Error('HTTP 500')),
      };
      await expectLlmError(
        collect(newService(provider, { ...defaults, stream: false })),
        'LLM_ERROR',
      );

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        outcome: LlmCallOutcome.ERROR,
        errorCode: 'LLM_ERROR',
        timeToFirstTokenMs: null,
      });
    });

    it('records a connection failure as ERROR with LLM_UNAVAILABLE', async () => {
      const provider: LlmProvider = {
        name: 'down',
        chat: () =>
          Promise.reject(
            new TypeError('fetch failed', {
              cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
            }),
          ),
      };
      await expectLlmError(
        collect(newService(provider, { ...defaults, stream: false })),
        'LLM_UNAVAILABLE',
      );
      expect(records[0]).toMatchObject({
        outcome: LlmCallOutcome.ERROR,
        errorCode: 'LLM_UNAVAILABLE',
      });
    });

    it('records a stall as TIMEOUT with LLM_TIMEOUT', async () => {
      const provider: LlmProvider = { name: 'stuck', chat: () => never() };
      await expectLlmError(
        collect(newService(provider, { ...defaults, stream: false, timeoutMs: 50 })),
        'LLM_TIMEOUT',
      );
      expect(records[0]).toMatchObject({
        outcome: LlmCallOutcome.TIMEOUT,
        errorCode: 'LLM_TIMEOUT',
        timeToFirstTokenMs: null,
      });
    });

    it('records a client abort as INTERRUPTED, without error code, keeping the first token time', async () => {
      const provider: LlmProvider = {
        name: 'slow',
        chat: () => never(),
        async *chatStream() {
          for (;;) {
            await wait(10);
            yield 'x';
          }
        },
      };
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 50);

      await expectLlmError(collect(newService(provider), controller.signal), 'LLM_ABORTED');
      expect(records[0]).toMatchObject({ outcome: LlmCallOutcome.INTERRUPTED, errorCode: null });
      expect(records[0]?.timeToFirstTokenMs).toEqual(expect.any(Number));
    });

    it('records INTERRUPTED when the consumer stops iterating early', async () => {
      const service = newService(fakeProvider(['a', 'b', 'c']));
      for await (const _delta of service.generate(history, new AbortController().signal, context)) {
        break;
      }

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ outcome: LlmCallOutcome.INTERRUPTED, errorCode: null });
      expect(records[0]?.timeToFirstTokenMs).toEqual(expect.any(Number));
    });
  });

  describe('logging', () => {
    it('logs one line per completed call: outcome, provider and timings', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await collect(newService(fakeProvider(['Hel', 'lo'])));

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          /^LLM call COMPLETED \(provider fake, \d+ ms, first token after \d+ ms\)$/,
        ),
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('logs a failed call as a warning with its error code', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const provider: LlmProvider = {
        name: 'broken',
        chat: () => Promise.reject(new Error('HTTP 500')),
      };

      await expectLlmError(
        collect(newService(provider, { ...defaults, stream: false })),
        'LLM_ERROR',
      );

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/^LLM call ERROR \(provider broken, \d+ ms, no token, LLM_ERROR\)$/),
      );
      expect(log).not.toHaveBeenCalled();
    });

    it('logs an interrupted call as an ordinary line: it is not an error', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const service = newService(fakeProvider(['a', 'b', 'c']));

      for await (const _delta of service.generate(history, new AbortController().signal, context)) {
        break;
      }

      expect(log).toHaveBeenCalledWith(expect.stringContaining('LLM call INTERRUPTED'));
    });

    it('never logs the prompt or the answer', async () => {
      const lines: string[] = [];
      for (const method of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
        vi.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
          lines.push(JSON.stringify(args));
        });
      }
      const service = newService(fakeProvider(['the', ' secret', ' answer']));

      await generateAll(service, [{ role: 'user', content: 'a very private question' }]);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toMatch(/private question|secret answer/);
    });
  });
});
