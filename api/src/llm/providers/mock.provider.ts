import { sleep } from '../abort.utils.js';
import { LlmError } from '../llm.errors.js';
import type { LlmChatResult, LlmMessage, LlmProvider, LlmRequestOptions } from '../llm.types.js';

export interface MockProviderOptions {
  /** Delay between two streamed tokens, in milliseconds. */
  tokenDelayMs: { min: number; max: number };
}

/** Including this marker in a message makes the mock fail mid-answer (to test error UIs). */
export const MOCK_ERROR_TRIGGER = '[mock:error]';

/**
 * Fake LLM used to develop and test without the real model server. Answers with a fixed
 * markdown text (including a code block) that echoes the last user message.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  constructor(
    private readonly options: MockProviderOptions = { tokenDelayMs: { min: 20, max: 40 } },
  ) {}

  async chat(messages: LlmMessage[], { signal }: LlmRequestOptions): Promise<LlmChatResult> {
    let text = '';
    for await (const token of this.chatStream(messages, { signal })) {
      text += token;
    }
    return { text };
  }

  /** Reports no usage: the figures are estimated by `LlmService`. */
  async *chatStream(
    messages: LlmMessage[],
    { signal }: LlmRequestOptions,
  ): AsyncGenerator<string, undefined> {
    const prompt = messages.findLast((message) => message.role === 'user')?.content ?? '';
    const shouldFail = prompt.includes(MOCK_ERROR_TRIGGER);
    const tokens = tokenize(buildAnswer(prompt));

    for (const [index, token] of tokens.entries()) {
      await sleep(this.randomDelay(), signal);
      if (shouldFail && index === Math.floor(tokens.length / 3)) {
        throw new LlmError('LLM_ERROR', `Mock failure triggered by ${MOCK_ERROR_TRIGGER}`);
      }
      yield token;
    }
  }

  private randomDelay(): number {
    const { min, max } = this.options.tokenDelayMs;
    return min + Math.random() * (max - min);
  }
}

function buildAnswer(prompt: string): string {
  const quoted = prompt.trim().slice(0, 200) || '(empty message)';
  return [
    `This is a **mock answer** — no language model was called.`,
    '',
    `> ${quoted.replaceAll('\n', '\n> ')}`,
    '',
    'It exists to develop the interface without the model server:',
    '',
    '- tokens are streamed with a small delay,',
    '- markdown and code blocks are rendered,',
    `- include \`${MOCK_ERROR_TRIGGER}\` in a message to simulate a failure.`,
    '',
    '```ts',
    'function greet(name: string): string {',
    '  return `Hello, ${name}!`;',
    '}',
    '```',
  ].join('\n');
}

/** Splits text into word-sized tokens, keeping whitespace so that tokens concatenate back. */
function tokenize(text: string): string[] {
  return text.match(/\s*\S+|\s+/g) ?? [];
}
