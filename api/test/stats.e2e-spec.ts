import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome, MessageRole } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { localDate } from '../src/stats/time-zone.js';
import { createTestUser, loginAs } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const URL = '/api/stats/me';

interface DailyPoint {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

interface StatsBody {
  period: { days: number; timeZone: string; from: string; to: string };
  requests: number;
  tokens: { prompt: { total: number }; completion: { total: number } };
  daily: DailyPoint[];
}

describe('GET /api/stats/me (e2e)', () => {
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let aliceId: string;
  let bobId: string;
  let aliceCookie: string;
  let bobCookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ http, prisma } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const alice = await createTestUser(prisma, 'Alice');
    const bob = await createTestUser(prisma, 'Bob');
    aliceId = alice.user.id;
    bobId = bob.user.id;
    aliceCookie = await loginAs(http, alice);
    bobCookie = await loginAs(http, bob);
  });

  /**
   * A recorded call with its tokens, in a conversation of its own (returned), whose answer is
   * stored too, like a real exchange.
   */
  async function addActivity(
    userId: string,
    at: Date,
    { durationMs = 100, promptTokens = 10, completionTokens = 5 } = {},
  ): Promise<string> {
    const conversation = await prisma.conversation.create({ data: { userId, title: 'Test' } });
    await prisma.llmCall.create({
      data: {
        userId,
        conversationId: conversation.id,
        provider: 'mock',
        startedAt: at,
        durationMs,
        timeToFirstTokenMs: 10,
        outcome: LlmCallOutcome.COMPLETED,
        promptTokens,
        completionTokens,
        tokensEstimated: true,
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: 'answer',
        createdAt: at,
        promptTokens,
        completionTokens,
        tokensEstimated: true,
      },
    });
    return conversation.id;
  }

  async function getStats(cookie: string, query = ''): Promise<StatsBody> {
    const response = await request(http).get(`${URL}${query}`).set('Cookie', cookie).expect(200);
    return response.body as StatsBody;
  }

  describe('authentication', () => {
    it('answers 401 without a session', async () => {
      await request(http).get(URL).expect(401);
    });
  });

  describe('isolation', () => {
    beforeEach(async () => {
      const recently = new Date(Date.now() - 60 * 60 * 1000);
      await addActivity(aliceId, recently, { durationMs: 100, promptTokens: 7 });
      await addActivity(bobId, recently, { durationMs: 9_000, promptTokens: 1_000 });
      await addActivity(bobId, recently, { durationMs: 9_000, promptTokens: 1_000 });
    });

    it('only counts the data of the caller', async () => {
      const alice = await getStats(aliceCookie);
      const bob = await getStats(bobCookie);

      expect(alice.requests).toBe(1);
      expect(alice.tokens.prompt.total).toBe(7);
      expect(bob.requests).toBe(2);
      expect(bob.tokens.prompt.total).toBe(2_000);
    });

    it('cannot be pointed at another user with a query parameter', async () => {
      for (const query of [`?userId=${bobId}`, `?user=${bobId}`, `?id=${bobId}&days=30`]) {
        const body = await getStats(aliceCookie, query);
        expect(body.requests).toBe(1);
        expect(body.tokens.prompt.total).toBe(7);
      }
    });

    it("does not leak the other user's activity into the daily series", async () => {
      const { daily } = await getStats(aliceCookie);
      const totalRequests = daily.reduce((total, day) => total + day.requests, 0);
      const totalTokens = daily.reduce((total, day) => total + day.promptTokens, 0);

      expect(totalRequests).toBe(1);
      expect(totalTokens).toBe(7);
    });

    it('does not mix the data of another user in when two users share the same day', async () => {
      // Both have activity on the same local day: the figures must stay apart.
      const alice = await getStats(aliceCookie);
      const bob = await getStats(bobCookie);
      const aliceToday = alice.daily.find((day) => day.requests > 0);
      const bobToday = bob.daily.find((day) => day.requests > 0);

      expect(aliceToday?.date).toBe(bobToday?.date);
      expect(aliceToday?.requests).toBe(1);
      expect(bobToday?.requests).toBe(2);
    });
  });

  describe('deleting a conversation', () => {
    it('leaves the stats unchanged, requests and tokens', async () => {
      const recently = new Date(Date.now() - 60 * 60 * 1000);
      await addActivity(aliceId, recently, { promptTokens: 10, completionTokens: 4 });
      const deleted = await addActivity(aliceId, recently, {
        promptTokens: 30,
        completionTokens: 6,
      });

      const before = await getStats(aliceCookie);
      await request(http)
        .delete(`/api/conversations/${deleted}`)
        .set('Cookie', aliceCookie)
        .expect(204);
      const after = await getStats(aliceCookie);

      // The answer went with its conversation, the call and its tokens stayed.
      expect(await prisma.message.count({ where: { conversationId: deleted } })).toBe(0);
      expect(before.requests).toBe(2);
      expect(before.tokens.prompt.total).toBe(40);
      expect(before.tokens.completion.total).toBe(10);
      expect(after).toEqual(before);
    });
  });

  describe('period', () => {
    it('defaults to 30 days in UTC', async () => {
      const body = await getStats(aliceCookie);

      expect(body.period).toMatchObject({ days: 30, timeZone: 'UTC' });
      expect(body.daily).toHaveLength(30);
      expect(body.period.to).toBe(localDate(new Date(), 'UTC'));
    });

    it.each([7, 30, 90])('covers %i days when asked', async (days) => {
      const body = await getStats(aliceCookie, `?days=${days}`);

      expect(body.period.days).toBe(days);
      expect(body.daily).toHaveLength(days);
    });

    it('only counts activity inside the period', async () => {
      const day = 24 * 60 * 60 * 1000;
      await addActivity(aliceId, new Date(Date.now() - 2 * day));
      await addActivity(aliceId, new Date(Date.now() - 20 * day));
      await addActivity(aliceId, new Date(Date.now() - 60 * day));

      expect((await getStats(aliceCookie, '?days=7')).requests).toBe(1);
      expect((await getStats(aliceCookie, '?days=30')).requests).toBe(2);
      expect((await getStats(aliceCookie, '?days=90')).requests).toBe(3);
    });
  });

  describe('time zone', () => {
    it('cuts the days in the requested time zone', async () => {
      // 23:30 UTC on the previous UTC day: already "today" in Paris (UTC+1 or UTC+2).
      const startOfUtcDay = new Date(`${localDate(new Date(), 'UTC')}T00:00:00Z`);
      await addActivity(aliceId, new Date(startOfUtcDay.getTime() - 30 * 60 * 1000));

      const inUtc = await getStats(aliceCookie, '?tz=UTC');
      const inParis = await getStats(aliceCookie, '?tz=Europe%2FParis');

      const utcDay = inUtc.daily.find((day) => day.requests === 1);
      const parisDay = inParis.daily.find((day) => day.requests === 1);
      expect(inParis.period.timeZone).toBe('Europe/Paris');
      expect(utcDay?.date).toBe(localDate(new Date(startOfUtcDay.getTime() - 1), 'UTC'));
      expect(parisDay?.date).toBe(localDate(startOfUtcDay, 'UTC'));
    });

    it('ends the period on the local "today" of the time zone', async () => {
      const kiritimati = await getStats(aliceCookie, '?tz=Pacific%2FKiritimati');
      const niue = await getStats(aliceCookie, '?tz=Pacific%2FNiue');

      expect(kiritimati.period.to).toBe(localDate(new Date(), 'Pacific/Kiritimati'));
      expect(niue.period.to).toBe(localDate(new Date(), 'Pacific/Niue'));
    });
  });

  describe('a user without data', () => {
    it('gets zeros and a full series', async () => {
      const body = await getStats(aliceCookie, '?days=7');

      expect(body).toMatchObject({
        requests: 0,
        tokens: { prompt: { total: 0 }, completion: { total: 0 } },
        averages: { durationMs: null, timeToFirstTokenMs: null },
      });
      expect(body.daily).toHaveLength(7);
      expect(body.daily.every((day) => day.requests === 0 && day.promptTokens === 0)).toBe(true);
    });
  });

  describe('invalid parameters', () => {
    it.each(['days=0', 'days=14', 'days=365', 'days=abc', 'days=', 'days=7&days=30', 'days=-7'])(
      'answers 400 for ?%s',
      async (query) => {
        const response = await request(http).get(`${URL}?${query}`).set('Cookie', aliceCookie);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ message: 'Validation failed' });
      },
    );

    it.each([
      'tz=Nowhere%2FLand',
      'tz=Paris',
      'tz=%2B01%3A00',
      'tz=CET',
      'tz=',
      "tz=Europe%2FParis'%3B%20DROP%20TABLE%20users%3B--",
    ])('answers 400 for ?%s', async (query) => {
      const response = await request(http).get(`${URL}?${query}`).set('Cookie', aliceCookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ message: 'Validation failed' });
    });

    it('does not run anything from the time zone', async () => {
      await request(http)
        .get(`${URL}?tz=${encodeURIComponent("Europe/Paris'; DROP TABLE users; --")}`)
        .set('Cookie', aliceCookie)
        .expect(400);

      expect(await prisma.user.count()).toBe(2);
    });
  });
});
