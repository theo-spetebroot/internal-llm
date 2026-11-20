import { describe, expect, it } from 'vitest';

import { LlmError, type LlmErrorCode } from './llm.errors.js';
import { type LlmOptions, LlmService } from './llm.service.js';
import type { LlmMessage, LlmProvider, LlmRequestOptions } from './llm.types.js';

const history: LlmMessage[] = [{ role: 'user', content: 'Hi' }];
const defaults: LlmOptions = { stream: true, timeoutMs: 1_000 };

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
      return Promise.resolve(tokens.join(''));
    },
    async *chatStream(messages) {
      calls.push({ method: 'chatStream', messages });
      for (const token of tokens) {
        await wait(delayMs);
        yield token;
      }
    },
  };
}

async function collect(
  service: LlmService,
  signal = new AbortController().signal,
): Promise<string[]> {
  const deltas: string[] = [];
  for await (const delta of service.generate(history, signal)) deltas.push(delta);
  return deltas;
}

async function expectLlmError(promise: Promise<unknown>, code: LlmErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(LlmError);
  expect((error as LlmError).code).toBe(code);
}

describe('LlmService', () => {
  describe('modes', () => {
    it('yields one delta per token when streaming', async () => {
      const service = new LlmService(fakeProvider(['Hel', 'lo', '!']), defaults);
      expect(await collect(service)).toEqual(['Hel', 'lo', '!']);
    });

    it('yields the full answer once when LLM_STREAM is off', async () => {
      const provider = fakeProvider(['Hel', 'lo', '!']);
      const service = new LlmService(provider, { ...defaults, stream: false });

      expect(await collect(service)).toEqual(['Hello!']);
      expect(provider.calls.map((call) => call.method)).toEqual(['chat']);
    });

    it('falls back to chat() when the provider cannot stream', async () => {
      const oneShotProvider: LlmProvider = {
        name: 'one-shot',
        chat: () => Promise.resolve('Hello'),
      };
      const service = new LlmService(oneShotProvider, defaults);
      expect(await collect(service)).toEqual(['Hello']);
    });
  });

  describe('system prompt', () => {
    it('is prepended when configured', async () => {
      const provider = fakeProvider(['ok']);
      await collect(new LlmService(provider, { ...defaults, systemPrompt: 'Be concise.' }));
      expect(provider.calls[0]?.messages).toEqual([
        { role: 'system', content: 'Be concise.' },
        ...history,
      ]);
    });

    it('is omitted otherwise', async () => {
      const provider = fakeProvider(['ok']);
      await collect(new LlmService(provider, defaults));
      expect(provider.calls[0]?.messages).toEqual(history);
    });
  });

  describe('timeouts', () => {
    it('times out a one-shot call that never answers, even if the provider ignores the signal', async () => {
      const provider: LlmProvider = { name: 'stuck', chat: () => never() };
      const service = new LlmService(provider, { ...defaults, stream: false, timeoutMs: 50 });
      await expectLlmError(collect(service), 'LLM_TIMEOUT');
    });

    it('does not cut a stream that keeps progressing beyond the timeout', async () => {
      // 10 tokens × 20 ms = 200 ms total, but never more than 20 ms of silence.
      const tokens = Array.from({ length: 10 }, (_, i) => `t${i}`);
      const service = new LlmService(fakeProvider(tokens, 20), { ...defaults, timeoutMs: 100 });
      expect(await collect(service)).toEqual(tokens);
    });

    it('times out a stream that stalls between two tokens', async () => {
      const provider: LlmProvider = {
        name: 'stalling',
        chat: () => never(),
        async *chatStream() {
          yield 'first';
          await never();
        },
      };
      const service = new LlmService(provider, { ...defaults, timeoutMs: 50 });
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

      await expectLlmError(
        collect(new LlmService(provider, defaults), controller.signal),
        'LLM_ABORTED',
      );
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
      const service = new LlmService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_UNAVAILABLE');
    });

    it('maps unknown failures to LLM_ERROR', async () => {
      const provider: LlmProvider = {
        name: 'broken',
        chat: () => Promise.reject(new Error('HTTP 500')),
      };
      const service = new LlmService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_ERROR');
    });

    it('keeps LlmError codes raised by the provider', async () => {
      const provider: LlmProvider = {
        name: 'explicit',
        chat: () => Promise.reject(new LlmError('LLM_UNAVAILABLE', 'model is loading')),
      };
      const service = new LlmService(provider, { ...defaults, stream: false });
      await expectLlmError(collect(service), 'LLM_UNAVAILABLE');
    });
  });
});
