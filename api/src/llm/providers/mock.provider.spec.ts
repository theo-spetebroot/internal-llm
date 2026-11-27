import { describe, expect, it } from 'vitest';

import { LlmError } from '../llm.errors.js';
import type { LlmMessage } from '../llm.types.js';
import { MOCK_ERROR_TRIGGER, MockLlmProvider } from './mock.provider.js';

const fast = new MockLlmProvider({ tokenDelayMs: { min: 0, max: 1 } });
const history: LlmMessage[] = [{ role: 'user', content: 'Hello mock' }];

async function collect(tokens: AsyncIterable<string>): Promise<string[]> {
  const result: string[] = [];
  for await (const token of tokens) result.push(token);
  return result;
}

describe('MockLlmProvider', () => {
  it('streams many tokens that concatenate into the full answer', async () => {
    const { signal } = new AbortController();
    const tokens = await collect(fast.chatStream(history, { signal }));
    const { text: full } = await fast.chat(history, { signal });

    expect(tokens.length).toBeGreaterThan(10);
    expect(tokens.join('')).toBe(full);
    expect(full).toContain('> Hello mock');
    expect(full).toContain('```ts');
  });

  it('reports no usage, so that the figures are estimated', async () => {
    const { signal } = new AbortController();
    const stream = fast.chatStream(history, { signal });
    let step = await stream.next();
    while (!step.done) step = await stream.next();

    expect(step.value).toBeUndefined();
    expect((await fast.chat(history, { signal })).usage).toBeUndefined();
  });

  it('answers to the last user message', async () => {
    const { text: answer } = await fast.chat(
      [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'second' },
      ],
      { signal: new AbortController().signal },
    );
    expect(answer).toContain('> second');
  });

  it('stops promptly when aborted', async () => {
    const slow = new MockLlmProvider({ tokenDelayMs: { min: 50, max: 50 } });
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new Error('client left'));
    }, 120);

    const received: string[] = [];
    const run = async (): Promise<void> => {
      for await (const token of slow.chatStream(history, { signal: controller.signal })) {
        received.push(token);
      }
    };

    await expect(run()).rejects.toThrow('client left');
    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThan(5);
  });

  it(`fails mid-answer when the message contains ${MOCK_ERROR_TRIGGER}`, async () => {
    const received: string[] = [];
    const run = async (): Promise<void> => {
      const messages: LlmMessage[] = [{ role: 'user', content: `boom ${MOCK_ERROR_TRIGGER}` }];
      for await (const token of fast.chatStream(messages, {
        signal: new AbortController().signal,
      })) {
        received.push(token);
      }
    };

    await expect(run()).rejects.toBeInstanceOf(LlmError);
    expect(received.length).toBeGreaterThan(0);
  });
});
