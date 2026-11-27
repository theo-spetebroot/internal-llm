import { describe, expect, it, vi } from 'vitest';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type LlmCallRecord, LlmCallRecorder } from './llm-call.recorder.js';

const record: LlmCallRecord = {
  userId: 'user-1',
  conversationId: 'conversation-1',
  provider: 'mock',
  startedAt: new Date('2026-11-26T10:00:00.000Z'),
  durationMs: 1200,
  timeToFirstTokenMs: 180,
  outcome: LlmCallOutcome.COMPLETED,
  errorCode: null,
  usage: { promptTokens: 40, completionTokens: 12, estimated: true },
};

function fakePrisma(create: (args: unknown) => Promise<unknown>): PrismaService {
  return { llmCall: { create: vi.fn(create) } } as unknown as PrismaService;
}

describe('LlmCallRecorder', () => {
  it('stores exactly the fields of the record', async () => {
    const create = vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({}));
    const recorder = new LlmCallRecorder(fakePrisma(create));

    recorder.record(record);
    await recorder.flush();

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        conversationId: 'conversation-1',
        provider: 'mock',
        startedAt: record.startedAt,
        durationMs: 1200,
        timeToFirstTokenMs: 180,
        outcome: 'COMPLETED',
        errorCode: null,
        promptTokens: 40,
        completionTokens: 12,
        tokensEstimated: true,
      },
    });
  });

  it('stores the token usage reported by the provider as not estimated', async () => {
    const create = vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({}));
    const recorder = new LlmCallRecorder(fakePrisma(create));

    recorder.record({
      ...record,
      usage: { promptTokens: 7, completionTokens: 3, estimated: false },
    });
    await recorder.flush();

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptTokens: 7,
        completionTokens: 3,
        tokensEstimated: false,
      }) as unknown,
    });
  });

  it('stores no token figure when the call has none', async () => {
    const create = vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({}));
    const recorder = new LlmCallRecorder(fakePrisma(create));

    recorder.record({ ...record, usage: null });
    await recorder.flush();

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptTokens: null,
        completionTokens: null,
        tokensEstimated: null,
      }) as unknown,
    });
  });

  it('does not wait for the database before returning', () => {
    const recorder = new LlmCallRecorder(fakePrisma(() => new Promise(() => undefined)));
    expect(() => {
      recorder.record(record);
    }).not.toThrow();
  });

  it('flush() waits for the writes started so far', async () => {
    let finish: () => void = () => undefined;
    const recorder = new LlmCallRecorder(
      fakePrisma(
        () =>
          new Promise((resolve) => {
            finish = () => {
              resolve({});
            };
          }),
      ),
    );

    recorder.record(record);
    let flushed = false;
    const flush = recorder.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);

    finish();
    await flush;
    expect(flushed).toBe(true);
  });

  it('absorbs a failed write instead of throwing', async () => {
    const recorder = new LlmCallRecorder(fakePrisma(() => Promise.reject(new Error('db down'))));

    recorder.record(record);
    await expect(recorder.flush()).resolves.toBeUndefined();
  });
});
