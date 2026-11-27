import { Writable } from 'node:stream';

export type LogRecord = Record<string, unknown> & {
  level: string;
  msg?: string;
  requestId?: string;
  context?: string;
};

/**
 * A log destination that keeps what is written to it, to read the log lines in tests. Pass it
 * as `LOG_STREAM`: the logger is silent in tests otherwise.
 */
export class LogCapture extends Writable {
  private output = '';

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }

  /** Everything written so far, to search for text that must not be there. */
  get text(): string {
    return this.output;
  }

  /** The log lines, parsed. Throws if a line is not a JSON object. */
  get records(): LogRecord[] {
    return this.output
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as LogRecord);
  }

  clear(): void {
    this.output = '';
  }
}

/** Retries `read` until it returns something, for logs written just after a response. */
export async function eventually<T>(read: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for a log line');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
