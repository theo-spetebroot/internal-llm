import { beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import { LlmError, type LlmErrorCode } from './llm.errors.js';
import { type LlmCallContext, type LlmOptions, LlmService } from './llm.service.js';
import type { LlmCallRecorder, LlmCallRecord } from './llm-call.recorder.js';
import type { LlmMessage, LlmProvider, LlmRequestOptions } from './llm.types.js';

const history: LlmMessage[] = [{ role: 'user', content: 'Hi' }];
const defaults: LlmOptions = { stream: true, timeoutMs: 1_000 };
const context: LlmCallContext = { userId: 'user-1', conversationId: 'conversation-1' };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

interface FakeProvider extends LlmProvider {
  /** Messages received by each call, tagged with the method used. */
  calls: { method: 'chat' | 'chatStream'; messages: LlmMessage[] }[];
}

/** Provider streaming `tokens` with `delayMs` between them (and the same text via chat()). */
function fakeProvider(tokens: string[], delayMs = 0): FakeProvider {
  const calls: FakeProvider['calls'] = [];
  return {
    name: 'fake',
    calls,
    chat(messages) {
      calls.push({ method: 'chat', messages });
      return Promise.resolve({ text: tokens.join('') });
    },
    async *chatStream(messages): AsyncGenerator<string, undefined> {
      calls.push({ method: 'chatStream', messages });
      for (const token of tokens) {
        await wait(delayMs);
        yield token;
      }
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

async function expectLlmError(promise: Promise<unknown>, code: LlmErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(LlmError);
  expect((error as LlmError).code).toBe(code);
}

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

    it('keeps only metadata: no prompt or answer text', async () => {
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
          'userId',
        ].sort(),
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
});
