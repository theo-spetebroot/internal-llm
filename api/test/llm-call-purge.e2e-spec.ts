import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome, MessageRole } from '../src/generated/prisma/enums.js';
import { purgeLlmCalls } from '../src/llm/llm-call.purge.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-27T12:00:00Z');

/** An instant `days` days (and `extraMs` ms) before NOW. */
const daysAgo = (days: number, extraMs = 0): Date =>
  new Date(NOW.getTime() - days * DAY_MS - extraMs);

describe('purgeLlmCalls (against PostgreSQL)', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ prisma } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createTestUser(prisma, 'Alice')).user.id;
  });

  function addCall(startedAt: Date, owner = userId, conversationId: string | null = null) {
    return prisma.llmCall.create({
      data: {
        userId: owner,
        conversationId,
        provider: 'mock',
        startedAt,
        durationMs: 100,
        outcome: LlmCallOutcome.COMPLETED,
      },
    });
  }

  async function remainingStartDates(): Promise<string[]> {
    const calls = await prisma.llmCall.findMany({ orderBy: { startedAt: 'asc' } });
    return calls.map((call) => call.startedAt.toISOString());
  }

  it('deletes the records older than the retention and keeps the newer ones', async () => {
    await addCall(daysAgo(200));
    await addCall(daysAgo(91));
    await addCall(daysAgo(89));
    await addCall(daysAgo(1));

    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.deleted).toBe(2);
    expect(await remainingStartDates()).toEqual([
      daysAgo(89).toISOString(),
      daysAgo(1).toISOString(),
    ]);
  });

  it('reports the cut-off instant it used', async () => {
    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.cutoff).toEqual(daysAgo(90));
  });

  it('keeps a record exactly at the cut-off and deletes the one just before', async () => {
    await addCall(daysAgo(90));
    await addCall(daysAgo(90, 1));

    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.deleted).toBe(1);
    expect(await remainingStartDates()).toEqual([daysAgo(90).toISOString()]);
  });

  it('respects the retention it is given', async () => {
    await addCall(daysAgo(100));
    await addCall(daysAgo(45));
    await addCall(daysAgo(10));

    expect((await purgeLlmCalls(prisma, 90, NOW)).deleted).toBe(1);
    expect((await purgeLlmCalls(prisma, 30, NOW)).deleted).toBe(1);
    expect((await purgeLlmCalls(prisma, 1, NOW)).deleted).toBe(1);
    expect(await prisma.llmCall.count()).toBe(0);
  });

  it('purges the records of every user', async () => {
    const bob = (await createTestUser(prisma, 'Bob')).user.id;
    await addCall(daysAgo(120), userId);
    await addCall(daysAgo(120), bob);
    await addCall(daysAgo(2), bob);

    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.deleted).toBe(2);
    expect(await prisma.llmCall.count({ where: { userId: bob } })).toBe(1);
  });

  it('does nothing when no record is old enough', async () => {
    await addCall(daysAgo(5));

    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.deleted).toBe(0);
    expect(await prisma.llmCall.count()).toBe(1);
  });

  it('never touches conversations, messages or accounts', async () => {
    const conversation = await prisma.conversation.create({
      data: { userId, title: 'Old conversation', createdAt: daysAgo(300) },
    });
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: 'Hello',
          createdAt: daysAgo(300),
        },
        {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: 'Hi!',
          createdAt: daysAgo(300),
        },
      ],
    });
    await addCall(daysAgo(300), userId, conversation.id);

    const result = await purgeLlmCalls(prisma, 90, NOW);

    expect(result.deleted).toBe(1);
    expect(await prisma.llmCall.count()).toBe(0);
    expect(await prisma.conversation.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2);
    expect(await prisma.user.count()).toBe(1);
  });
});
