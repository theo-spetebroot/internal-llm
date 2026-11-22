import type { ServerResponse } from 'node:http';

import { type ChatEvent, chatEventSchema } from './chat.schemas.js';

export const SSE_HEARTBEAT_MS = 15_000;

/** The subset of the HTTP response the writer needs (eases unit testing). */
export type SseResponse = Pick<
  ServerResponse,
  'writeHead' | 'flushHeaders' | 'write' | 'end' | 'writableEnded' | 'destroyed'
>;

/**
 * Writes chat events as Server-Sent Events on a raw HTTP response.
 *
 * - Each event is validated against the contract and sent as `event: <type>` + JSON `data`.
 * - A comment line is sent periodically so that proxies (nginx: 60 s by default) keep the
 *   connection open while the model is thinking without emitting anything.
 * - Writes after the client is gone are silently dropped.
 */
export class SseWriter {
  private heartbeat: NodeJS.Timeout | undefined;
  private opened = false;

  constructor(
    private readonly response: SseResponse,
    private readonly heartbeatMs = SSE_HEARTBEAT_MS,
  ) {}

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disables response buffering in nginx, which would otherwise hold the deltas back.
      'X-Accel-Buffering': 'no',
    });
    this.response.flushHeaders();
    this.opened = true;
    this.heartbeat = setInterval(() => {
      this.write(': ping\n\n');
    }, this.heartbeatMs);
    this.heartbeat.unref();
  }

  send(event: ChatEvent): void {
    const data = chatEventSchema.parse(event);
    this.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  close(): void {
    clearInterval(this.heartbeat);
    if (!this.response.writableEnded) this.response.end();
  }

  private write(chunk: string): void {
    if (this.response.writableEnded || this.response.destroyed) return;
    this.response.write(chunk);
  }
}
