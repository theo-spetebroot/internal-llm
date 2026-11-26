import { describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { LlmCallRecorder } from '../src/llm/llm-call.recorder.js';
import { LlmCallOutcome } from '../src/generated/prisma/enums.js';
import { createTestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase } from './helpers/test-app.js';
import { TEST_DATABASE_URL } from './test-env.js';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('LLM call records on shutdown (e2e)', () => {
  it('still writes a record that is pending when the application closes', async () => {
    const testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    const owner = await createTestUser(testApp.prisma, 'Shutdown');
    const recorder = testApp.app.get(LlmCallRecorder);

    // Hold a lock on the table from another connection: the recorder's INSERT now waits,
    // so the write is still in flight when the application starts closing.
    const locker = createPrismaClient(TEST_DATABASE_URL);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = locker.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('LOCK TABLE llm_calls IN ACCESS EXCLUSIVE MODE');
      await released;
    });
    await wait(200);

    recorder.record({
      userId: owner.user.id,
      conversationId: null,
      provider: 'shutdown',
      startedAt: new Date(),
      durationMs: 10,
      timeToFirstTokenMs: null,
      outcome: LlmCallOutcome.COMPLETED,
      errorCode: null,
    });

    const closing = testApp.close();
    await wait(300);
    release();
    await Promise.all([holding, closing]);
    await locker.$disconnect();

    const checker = createPrismaClient(TEST_DATABASE_URL);
    try {
      const rows = await checker.llmCall.findMany({ where: { userId: owner.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.provider).toBe('shutdown');
    } finally {
      await checker.$disconnect();
    }
  });
});
