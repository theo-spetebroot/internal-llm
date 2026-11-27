import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome, MessageRole } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { StatsQuery } from '../src/stats/stats.schemas.js';
import { StatsService } from '../src/stats/stats.service.js';
import { createTestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

/** Thursday 27 November 2026, noon UTC: 13:00 in Paris. */
const NOW = new Date('2026-11-27T12:00:00Z');

const utc = (days: 7 | 30 | 90 = 30): StatsQuery => ({ days, tz: 'UTC' });
const paris = (days: 7 | 30 | 90 = 30): StatsQuery => ({ days, tz: 'Europe/Paris' });

describe('StatsService (aggregation against PostgreSQL)', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let stats: StatsService;
  let userId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ prisma } = testApp);
    stats = testApp.app.get(StatsService);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createTestUser(prisma, 'Alice')).user.id;
  });

  function addConversation() {
    return prisma.conversation.create({ data: { userId, title: 'Test' } });
  }

  /** A recorded call. By default it has no token figure; pass them to record some. */
  function addCall(
    startedAt: string,
    fields: Partial<{
      userId: string;
      conversationId: string | null;
      durationMs: number;
      timeToFirstTokenMs: number | null;
      outcome: LlmCallOutcome;
      promptTokens: number | null;
      completionTokens: number | null;
      tokensEstimated: boolean | null;
    }> = {},
  ) {
    return prisma.llmCall.create({
      data: {
        userId,
        provider: 'mock',
        startedAt: new Date(startedAt),
        durationMs: 100,
        timeToFirstTokenMs: 10,
        outcome: LlmCallOutcome.COMPLETED,
        ...fields,
      },
    });
  }

  /** A call that has token figures. */
  function addCallWithTokens(
    startedAt: string,
    promptTokens: number,
    completionTokens: number,
    tokensEstimated = true,
    fields: Parameters<typeof addCall>[1] = {},
  ) {
    return addCall(startedAt, { promptTokens, completionTokens, tokensEstimated, ...fields });
  }

  describe('a user without data', () => {
    it('gets zeros, no averages and a full series of empty days', async () => {
      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.period).toEqual({
        days: 30,
        timeZone: 'UTC',
        from: '2026-10-29',
        to: '2026-11-27',
      });
      expect(result.requests).toBe(0);
      expect(result.tokens).toEqual({
        prompt: { total: 0, estimated: 0, reported: 0 },
        completion: { total: 0, estimated: 0, reported: 0 },
      });
      expect(result.averages).toEqual({ durationMs: null, timeToFirstTokenMs: null });
      expect(result.daily).toHaveLength(30);
      expect(result.daily.every((day) => day.requests === 0)).toBe(true);
    });
  });

  describe('requests', () => {
    it('counts the calls and averages their durations', async () => {
      await addCall('2026-11-27T08:00:00Z', { durationMs: 100, timeToFirstTokenMs: 10 });
      await addCall('2026-11-27T09:00:00Z', { durationMs: 300, timeToFirstTokenMs: 30 });
      // No first token (failed before any answer): left out of the time-to-first-token average.
      await addCall('2026-11-26T09:00:00Z', {
        durationMs: 200,
        timeToFirstTokenMs: null,
        outcome: LlmCallOutcome.ERROR,
      });

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.requests).toBe(3);
      expect(result.averages).toEqual({ durationMs: 200, timeToFirstTokenMs: 20 });
    });

    it('splits the calls by outcome', async () => {
      await addCall('2026-11-27T01:00:00Z', { outcome: LlmCallOutcome.COMPLETED });
      await addCall('2026-11-27T02:00:00Z', { outcome: LlmCallOutcome.COMPLETED });
      await addCall('2026-11-27T03:00:00Z', { outcome: LlmCallOutcome.INTERRUPTED });
      await addCall('2026-11-27T04:00:00Z', { outcome: LlmCallOutcome.TIMEOUT });

      const { outcomes } = await stats.getUserStats(userId, utc(), NOW);

      expect(outcomes).toEqual({
        completed: { count: 2, rate: 0.5 },
        interrupted: { count: 1, rate: 0.25 },
        error: { count: 0, rate: 0 },
        timeout: { count: 1, rate: 0.25 },
      });
    });

    it('puts each call in its day and fills the quiet days with zeros', async () => {
      await addCall('2026-11-25T10:00:00Z');
      await addCall('2026-11-25T11:00:00Z');
      await addCall('2026-11-27T10:00:00Z');

      const { daily } = await stats.getUserStats(userId, utc(7), NOW);

      expect(daily.map(({ date, requests }) => [date, requests])).toEqual([
        ['2026-11-21', 0],
        ['2026-11-22', 0],
        ['2026-11-23', 0],
        ['2026-11-24', 0],
        ['2026-11-25', 2],
        ['2026-11-26', 0],
        ['2026-11-27', 1],
      ]);
    });
  });

  describe('tokens', () => {
    it('sums the tokens of the calls and tells estimated from reported', async () => {
      await addCallWithTokens('2026-11-26T10:00:00Z', 10, 4, true);
      await addCallWithTokens('2026-11-27T10:00:00Z', 30, 6, false);

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.tokens).toEqual({
        prompt: { total: 40, estimated: 10, reported: 30 },
        completion: { total: 10, estimated: 4, reported: 6 },
      });
      expect(result.daily.at(-2)).toMatchObject({ promptTokens: 10, completionTokens: 4 });
      expect(result.daily.at(-1)).toMatchObject({ promptTokens: 30, completionTokens: 6 });
    });

    it('counts a call without token figures as a request that adds no token', async () => {
      // Never reached the server, left before any token, or recorded before the token columns.
      await addCall('2026-11-27T10:00:00Z', { outcome: LlmCallOutcome.ERROR });
      await addCall('2026-11-27T11:00:00Z', {
        promptTokens: null,
        completionTokens: null,
        tokensEstimated: null,
      });
      await addCallWithTokens('2026-11-27T12:00:00Z', 5, 2);

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.requests).toBe(3);
      expect(result.tokens.prompt.total).toBe(5);
      expect(result.tokens.completion.total).toBe(2);
    });

    it('counts the prompt of a call that failed before any token, with no answer', async () => {
      await addCallWithTokens('2026-11-27T10:00:00Z', 12, 0, true, {
        outcome: LlmCallOutcome.ERROR,
      });

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.tokens.prompt).toEqual({ total: 12, estimated: 12, reported: 0 });
      expect(result.tokens.completion.total).toBe(0);
    });

    it('adds up the tokens of the calls of every conversation, and of calls without one', async () => {
      const first = await addConversation();
      const second = await addConversation();
      await addCallWithTokens('2026-11-27T10:00:00Z', 10, 1, true, { conversationId: first.id });
      await addCallWithTokens('2026-11-27T11:00:00Z', 20, 1, true, { conversationId: second.id });
      await addCallWithTokens('2026-11-27T11:30:00Z', 5, 1, true, { conversationId: null });

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.tokens.prompt.total).toBe(35);
    });

    it('ignores the tokens stored on the messages: only the calls count', async () => {
      const conversation = await addConversation();
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: 'answer',
          createdAt: new Date('2026-11-27T10:00:00Z'),
          promptTokens: 999,
          completionTokens: 999,
          tokensEstimated: true,
        },
      });

      const result = await stats.getUserStats(userId, utc(), NOW);

      expect(result.tokens.prompt.total).toBe(0);
      expect(result.tokens.completion.total).toBe(0);
    });
  });

  describe('deleting a conversation', () => {
    it('changes neither the requests nor the tokens', async () => {
      const kept = await addConversation();
      const deleted = await addConversation();
      await addCallWithTokens('2026-11-26T10:00:00Z', 10, 4, true, { conversationId: kept.id });
      await addCallWithTokens('2026-11-27T10:00:00Z', 30, 6, false, {
        conversationId: deleted.id,
        durationMs: 300,
      });
      await prisma.message.create({
        data: {
          conversationId: deleted.id,
          role: MessageRole.ASSISTANT,
          content: 'answer',
          promptTokens: 30,
          completionTokens: 6,
          tokensEstimated: false,
        },
      });

      const before = await stats.getUserStats(userId, utc(), NOW);
      await prisma.conversation.delete({ where: { id: deleted.id } });
      const after = await stats.getUserStats(userId, utc(), NOW);

      expect(await prisma.message.count({ where: { conversationId: deleted.id } })).toBe(0);
      expect(before.requests).toBe(2);
      expect(before.tokens.prompt.total).toBe(40);
      expect(after).toEqual(before);
    });
  });

  describe('period', () => {
    it('keeps the first day of the period and drops the day before', async () => {
      await addCallWithTokens('2026-11-20T23:59:59Z', 1000, 0);
      await addCallWithTokens('2026-11-21T00:00:00Z', 1, 0);

      const result = await stats.getUserStats(userId, utc(7), NOW);

      expect(result.period).toMatchObject({ from: '2026-11-21', to: '2026-11-27' });
      expect(result.requests).toBe(1);
      expect(result.tokens.prompt.total).toBe(1);
    });

    it('widens with the requested number of days', async () => {
      await addCall('2026-11-27T10:00:00Z');
      await addCall('2026-11-10T10:00:00Z');
      await addCall('2026-09-20T10:00:00Z');
      await addCall('2026-08-01T10:00:00Z');

      expect((await stats.getUserStats(userId, utc(7), NOW)).requests).toBe(1);
      expect((await stats.getUserStats(userId, utc(30), NOW)).requests).toBe(2);
      expect((await stats.getUserStats(userId, utc(90), NOW)).requests).toBe(3);
    });
  });

  describe('time zone', () => {
    it('puts a call made at 23:30 UTC on the next day in Europe/Paris', async () => {
      await addCall('2026-11-26T23:30:00Z');

      const inUtc = await stats.getUserStats(userId, utc(7), NOW);
      const inParis = await stats.getUserStats(userId, paris(7), NOW);

      expect(inUtc.daily.find((day) => day.requests === 1)?.date).toBe('2026-11-26');
      expect(inParis.daily.find((day) => day.requests === 1)?.date).toBe('2026-11-27');
    });

    it('cuts the tokens by local day too', async () => {
      await addCallWithTokens('2026-11-26T23:30:00Z', 7, 0);

      const inParis = await stats.getUserStats(userId, paris(7), NOW);

      expect(inParis.daily.at(-1)).toMatchObject({ date: '2026-11-27', promptTokens: 7 });
    });

    it('starts the period at the local midnight of its first day', async () => {
      // 23:30 UTC on the 20th is 00:30 on the 21st in Paris: inside a 7-day period there,
      // but still the 20th (outside) in UTC.
      await addCall('2026-11-20T23:30:00Z');

      expect((await stats.getUserStats(userId, paris(7), NOW)).requests).toBe(1);
      expect((await stats.getUserStats(userId, utc(7), NOW)).requests).toBe(0);
    });

    it('uses the local day of "now" to end the period', async () => {
      const lateEvening = new Date('2026-11-27T23:30:00Z');

      expect((await stats.getUserStats(userId, utc(7), lateEvening)).period.to).toBe('2026-11-27');
      expect((await stats.getUserStats(userId, paris(7), lateEvening)).period.to).toBe(
        '2026-11-28',
      );
    });

    it('follows daylight saving time: both sides of the change fall on the same local day', async () => {
      // Paris goes back to UTC+1 on 2026-10-25 at 03:00 local: that day lasts 25 hours.
      await addCall('2026-10-24T22:30:00Z'); // 00:30 on the 25th (UTC+2)
      await addCall('2026-10-25T22:30:00Z'); // 23:30 on the 25th (UTC+1)
      await addCall('2026-10-25T23:30:00Z'); // 00:30 on the 26th

      const { daily } = await stats.getUserStats(userId, paris(90), NOW);

      expect(
        daily.filter((day) => day.requests > 0).map(({ date, requests }) => [date, requests]),
      ).toEqual([
        ['2026-10-25', 2],
        ['2026-10-26', 1],
      ]);
    });
  });

  describe('isolation', () => {
    it("never counts another user's calls or tokens", async () => {
      const bob = (await createTestUser(prisma, 'Bob')).user.id;
      await addCallWithTokens('2026-11-27T10:00:00Z', 12_345, 100, true, {
        userId: bob,
        durationMs: 5_000,
      });
      await addCallWithTokens('2026-11-27T11:00:00Z', 7, 1);

      const alice = await stats.getUserStats(userId, utc(), NOW);
      const other = await stats.getUserStats(bob, utc(), NOW);

      expect(alice.requests).toBe(1);
      expect(alice.averages.durationMs).toBe(100);
      expect(alice.tokens.prompt.total).toBe(7);
      expect(other.requests).toBe(1);
      expect(other.averages.durationMs).toBe(5_000);
      expect(other.tokens.prompt.total).toBe(12_345);
    });
  });
});
