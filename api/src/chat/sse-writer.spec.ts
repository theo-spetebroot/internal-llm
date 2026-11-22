import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatEvent } from './chat.schemas.js';
import { type SseResponse, SseWriter } from './sse-writer.js';

/** In-memory stand-in for the HTTP response. */
function fakeResponse() {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    writeHead(status: number, values: Record<string, string>) {
      response.statusCode = status;
      Object.assign(headers, values);
      return response;
    },
    flushHeaders: vi.fn(),
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      response.writableEnded = true;
      return response;
    },
  };
  return { response, chunks, headers, asSse: response as unknown as SseResponse };
}

describe('SseWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the stream with SSE headers and unbuffered proxying', () => {
    const { response, headers, asSse } = fakeResponse();
    new SseWriter(asSse).open();

    expect(response.statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(response.flushHeaders).toHaveBeenCalled();
  });

  it('writes each event as a named SSE event with a JSON payload', () => {
    const { chunks, asSse } = fakeResponse();
    const sse = new SseWriter(asSse);
    sse.open();
    sse.send({ type: 'delta', content: 'Hello' });

    expect(chunks).toEqual(['event: delta\ndata: {"type":"delta","content":"Hello"}\n\n']);
  });

  it('rejects events that do not match the contract', () => {
    const { asSse } = fakeResponse();
    const sse = new SseWriter(asSse);
    sse.open();
    const invalid = { type: 'delta' } as unknown as ChatEvent;
    expect(() => {
      sse.send(invalid);
    }).toThrow();
  });

  it('sends heartbeats until closed', () => {
    const { response, chunks, asSse } = fakeResponse();
    const sse = new SseWriter(asSse, 1_000);
    sse.open();

    vi.advanceTimersByTime(2_500);
    expect(chunks).toEqual([': ping\n\n', ': ping\n\n']);

    sse.close();
    vi.advanceTimersByTime(5_000);
    expect(chunks).toHaveLength(2);
    expect(response.writableEnded).toBe(true);
  });

  it('drops writes once the client is gone', () => {
    const { response, chunks, asSse } = fakeResponse();
    const sse = new SseWriter(asSse);
    sse.open();
    response.destroyed = true;

    sse.send({ type: 'delta', content: 'lost' });
    expect(chunks).toEqual([]);
  });
});
