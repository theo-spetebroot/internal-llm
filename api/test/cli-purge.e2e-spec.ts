import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome } from '../src/generated/prisma/enums.js';
import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { createUser } from '../src/users/create-user.js';
import { runCli } from './helpers/run-cli.js';
import { TEST_DATABASE_URL } from './test-env.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const db = createPrismaClient(TEST_DATABASE_URL);
let userId: string;

async function addCall(startedAt: Date): Promise<void> {
  await db.llmCall.create({
    data: {
      userId,
      provider: 'mock',
      startedAt,
      durationMs: 100,
      outcome: LlmCallOutcome.COMPLETED,
    },
  });
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE TABLE users, conversations, messages, llm_calls CASCADE`;
  userId = (
    await createUser(db, {
      email: 'alice@example.com',
      displayName: 'Alice',
      password: 'correct-horse-battery-staple',
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('llm-calls:purge (e2e)', () => {
  it('deletes the records older than the default retention (90 days) and says how many', async () => {
    await addCall(daysAgo(120));
    await addCall(daysAgo(100));
    await addCall(daysAgo(10));

    const result = await runCli('purge-llm-calls.ts', []);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Deleted 2 LLM call record(s)');
    expect(result.stdout).toContain('retention: 90 days');
    expect(await db.llmCall.count()).toBe(1);
  });

  it('uses LLM_CALL_RETENTION_DAYS from the environment', async () => {
    await addCall(daysAgo(45));
    await addCall(daysAgo(10));

    const result = await runCli('purge-llm-calls.ts', [], '', { LLM_CALL_RETENTION_DAYS: '30' });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('retention: 30 days');
    expect(await db.llmCall.count()).toBe(1);
  });

  it('lets --days override the environment', async () => {
    await addCall(daysAgo(20));
    await addCall(daysAgo(3));

    const result = await runCli('purge-llm-calls.ts', ['--days', '7'], '', {
      LLM_CALL_RETENTION_DAYS: '90',
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('retention: 7 days');
    expect(await db.llmCall.count()).toBe(1);
  });

  it('reports zero when nothing is old enough', async () => {
    await addCall(daysAgo(1));

    const result = await runCli('purge-llm-calls.ts', []);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Deleted 0 LLM call record(s)');
    expect(await db.llmCall.count()).toBe(1);
  });

  it('never touches conversations or messages', async () => {
    const conversation = await db.conversation.create({
      data: { userId, title: 'Old', createdAt: daysAgo(400) },
    });
    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: 'Hello',
        createdAt: daysAgo(400),
      },
    });
    await addCall(daysAgo(400));

    await runCli('purge-llm-calls.ts', ['--days', '1']);

    expect(await db.llmCall.count()).toBe(0);
    expect(await db.conversation.count()).toBe(1);
    expect(await db.message.count()).toBe(1);
  });

  it.each([['0'], ['-5'], ['1.5'], ['abc'], ['4000']])(
    'refuses --days %s and deletes nothing',
    async (days) => {
      await addCall(daysAgo(500));

      const result = await runCli('purge-llm-calls.ts', [`--days=${days}`]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Invalid retention');
      expect(await db.llmCall.count()).toBe(1);
    },
  );

  it('refuses an invalid LLM_CALL_RETENTION_DAYS and deletes nothing', async () => {
    await addCall(daysAgo(500));

    const result = await runCli('purge-llm-calls.ts', [], '', { LLM_CALL_RETENTION_DAYS: '0' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid retention');
    expect(await db.llmCall.count()).toBe(1);
  });
});
