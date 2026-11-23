import { describe, expect, it } from 'vitest';

import { collect, streamFrom } from '@/test/streams';

import { readServerSentEvents } from './sse';

const read = (chunks: (string | Uint8Array<ArrayBuffer>)[]) =>
  collect(readServerSentEvents(streamFrom(chunks)));

describe('readServerSentEvents', () => {
  it('reads events with their type and data', async () => {
    expect(await read(['event: start\ndata: {"a":1}\n\nevent: delta\ndata: {"b":2}\n\n'])).toEqual([
      { event: 'start', data: '{"a":1}' },
      { event: 'delta', data: '{"b":2}' },
    ]);
  });

  it('gives the same events whatever the chunk boundaries', async () => {
    const payload = 'event: delta\r\ndata: {"content":"é ✓"}\r\n\r\n: ping\n\ndata: x\r\r';
    const expected = await read([payload]);
    expect(expected).toEqual([
      { event: 'delta', data: '{"content":"é ✓"}' },
      { event: 'message', data: 'x' },
    ]);

    // Split the bytes at every position, including inside multi-byte UTF-8 characters.
    const bytes = new TextEncoder().encode(payload);
    for (let cut = 1; cut < bytes.length; cut++) {
      expect(await read([bytes.slice(0, cut), bytes.slice(cut)])).toEqual(expected);
    }
  });

  it('joins multi-line data and strips one leading space only', async () => {
    expect(await read(['data:  two spaces\ndata:no space\ndata\n\n'])).toEqual([
      { event: 'message', data: ' two spaces\nno space\n' },
    ]);
  });

  it('accepts LF, CRLF and CR line endings', async () => {
    expect(await read(['data: a\n\n', 'data: b\r\n\r\n', 'data: c\r\r'])).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
      { event: 'message', data: 'c' },
    ]);
  });

  it('ignores comments, unknown fields and events without data', async () => {
    expect(
      await read([': ping\n\nid: 7\nretry: 1000\nfoo: bar\n\nevent: lonely\n\ndata: kept\n\n']),
    ).toEqual([{ event: 'message', data: 'kept' }]);
  });

  it('drops an unterminated last event', async () => {
    expect(await read(['data: complete\n\ndata: cut in the midd'])).toEqual([
      { event: 'message', data: 'complete' },
    ]);
  });

  it('ignores a byte order mark', async () => {
    expect(await read(['﻿data: x\n\n'])).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('cancels the stream when the consumer stops early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n\ndata: 2\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const event of readServerSentEvents(body)) {
      expect(event.data).toBe('1');
      break;
    }

    expect(cancelled).toBe(true);
  });
});
