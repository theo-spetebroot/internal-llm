/** One dispatched Server-Sent Event. */
export interface ServerSentEvent {
  /** `event:` field; "message" when absent. */
  event: string;
  /** `data:` lines joined with "\n". */
  data: string;
}

/**
 * Reads a `text/event-stream` body, following the HTML specification's parsing rules:
 * lines end with CRLF, LF or CR (possibly split across chunks), comment lines (`: ping`) are
 * ignored, `data:` lines accumulate, a blank line dispatches the event, and an unterminated
 * last event is dropped. `id:` and `retry:` only matter for EventSource reconnection and
 * are ignored here.
 */
export async function* readServerSentEvents(
  body: ReadableStream<BufferSource>,
): AsyncGenerator<ServerSentEvent, void, undefined> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let firstChunk = true;
  let eventType = '';
  let dataLines: string[] = [];

  /** Applies one line; returns the event to dispatch, if any. */
  const processLine = (line: string): ServerSentEvent | undefined => {
    if (line === '') {
      const event =
        dataLines.length > 0
          ? { event: eventType || 'message', data: dataLines.join('\n') }
          : undefined;
      eventType = '';
      dataLines = [];
      return event;
    }
    if (line.startsWith(':')) return undefined;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') eventType = value;
    else if (field === 'data') dataLines.push(value);
    return undefined;
  };

  /** Processes the complete lines of the buffer, keeping the unterminated rest. */
  function* drain(endOfStream: boolean): Generator<ServerSentEvent> {
    let start = 0;
    for (let index = 0; index < buffer.length; index++) {
      const char = buffer[index];
      if (char !== '\n' && char !== '\r') continue;
      // A CR at the very end may be the first half of a CRLF split across chunks.
      if (char === '\r' && index === buffer.length - 1 && !endOfStream) break;

      const event = processLine(buffer.slice(start, index));
      if (event) yield event;
      if (char === '\r' && buffer[index + 1] === '\n') index++;
      start = index + 1;
    }
    buffer = buffer.slice(start);
  }

  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        yield* drain(true);
        return;
      }

      buffer += value;
      if (firstChunk && buffer.length > 0) {
        if (buffer.startsWith('﻿')) buffer = buffer.slice(1);
        firstChunk = false;
      }
      yield* drain(false);
    }
  } finally {
    // The consumer stopped early: close the stream (and the HTTP response) behind it.
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
