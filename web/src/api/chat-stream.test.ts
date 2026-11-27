import { describe, expect, it } from 'vitest';

import { collect, streamFrom } from '@/test/streams';

import type { ChatEvent } from './chat-events';
import { ChatStreamError, readChatEvents } from './chat-stream';

const NOW = '2026-11-22T14:32:00.000Z';

function sse(event: unknown): string {
  return `event: x\ndata: ${JSON.stringify(event)}\n\n`;
}

const message = {
  id: 'm1',
  role: 'user' as const,
  content: 'Bonjour',
  interrupted: false,
  promptTokens: null,
  completionTokens: null,
  tokensEstimated: null,
  createdAt: NOW,
};
const conversation = {
  id: 'c1',
  title: 'Bonjour',
  createdAt: NOW,
  updatedAt: NOW,
  lastMessageAt: NOW,
};

describe('readChatEvents', () => {
  it('yields validated events, ignoring heartbeats', async () => {
    const events: ChatEvent[] = [
      { type: 'start', conversation, userMessage: message },
      { type: 'delta', content: 'Bon' },
      { type: 'delta', content: 'jour' },
      { type: 'done', assistantMessage: { ...message, id: 'm2', role: 'assistant' as const } },
    ];
    const chunks = [sse(events[0]), ': ping\n\n', sse(events[1]) + sse(events[2]), sse(events[3])];

    expect(await collect(readChatEvents(streamFrom(chunks)))).toEqual(events);
  });

  it('accepts an error event with or without a partial answer', async () => {
    const events = [
      { type: 'error', code: 'LLM_TIMEOUT', message: 'Trop long', assistantMessage: null },
      {
        type: 'error',
        code: 'LLM_ERROR',
        message: 'Erreur',
        assistantMessage: { ...message, role: 'assistant', interrupted: true },
      },
    ];

    expect(await collect(readChatEvents(streamFrom(events.map(sse))))).toEqual(events);
  });

  it('rejects data that is not JSON', async () => {
    await expect(collect(readChatEvents(streamFrom(['data: {oops\n\n'])))).rejects.toBeInstanceOf(
      ChatStreamError,
    );
  });

  it.each([
    ['an unknown type', { type: 'thinking' }],
    ['a missing field', { type: 'delta' }],
    ['an unknown error code', { type: 'error', code: 'NOPE', message: '', assistantMessage: null }],
    ['a malformed date', { type: 'done', assistantMessage: { ...message, createdAt: 'hier' } }],
  ])('rejects an event with %s', async (_case, event) => {
    await expect(collect(readChatEvents(streamFrom([sse(event)])))).rejects.toThrow(
      'does not match the contract',
    );
  });
});
