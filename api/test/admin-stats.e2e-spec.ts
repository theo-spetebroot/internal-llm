import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LlmCallOutcome } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { localDate } from '../src/stats/time-zone.js';
import { createTestUser, loginAs, type TestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const URL = '/api/admin/stats';
const ME_URL = '/api/stats/me';
const DAY_MS = 24 * 60 * 60 * 1000;

interface RankingEntry {
  email: string;
  displayName: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  failureRate: number;
}

interface AdminStatsBody {
  period: { days: number; timeZone: string; from: string; to: string };
  requests: number;
  tokens: {
    prompt: { total: number; estimated: number; reported: number };
    completion: { total: number; estimated: number; reported: number };
  };
  averages: { durationMs: number | null; timeToFirstTokenMs: number | null };
  outcomes: Record<
    'completed' | 'interrupted' | 'error' | 'timeout',
    { count: number; rate: number }
  >;
  daily: { date: string; requests: number; promptTokens: number; completionTokens: number }[];
  activeUsers: number;
  users: RankingEntry[];
}

interface CallFields {
  durationMs?: number;
  timeToFirstTokenMs?: number | null;
  outcome?: LlmCallOutcome;
  promptTokens?: number;
  completionTokens?: number;
  tokensEstimated?: boolean;
}

describe('GET /api/admin/stats (e2e)', () => {
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let boss: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let bossCookie: string;
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
    boss = await createTestUser(prisma, 'Boss');
    await prisma.user.update({ where: { id: boss.user.id }, data: { role: 'ADMIN' } });
    alice = await createTestUser(prisma, 'Alice');
    bob = await createTestUser(prisma, 'Bob');
    // Never calls the model.
    carol = await createTestUser(prisma, 'Carol');
    bossCookie = await loginAs(http, boss);
    aliceCookie = await loginAs(http, alice);
    bobCookie = await loginAs(http, bob);
  });

  function addCall(user: TestUser, startedAt: Date, fields: CallFields = {}) {
    return prisma.llmCall.create({
      data: {
        userId: user.user.id,
        provider: 'mock',
        startedAt,
        durationMs: 100,
        timeToFirstTokenMs: 10,
        outcome: LlmCallOutcome.COMPLETED,
        promptTokens: 10,
        completionTokens: 5,
        tokensEstimated: true,
        ...fields,
      },
    });
  }

  const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);
  const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

  async function getStats(cookie: string, query = ''): Promise<AdminStatsBody> {
    const response = await request(http).get(`${URL}${query}`).set('Cookie', cookie).expect(200);
    return response.body as AdminStatsBody;
  }

  function entryOf(body: AdminStatsBody, user: TestUser): RankingEntry | undefined {
    return body.users.find((entry) => entry.email === user.email);
  }

  describe('access', () => {
    it('answers 401 without a session', async () => {
      await request(http).get(URL).expect(401);
    });

    it('answers 403 to a signed-in user who is not an admin', async () => {
      await request(http).get(URL).set('Cookie', aliceCookie).expect(403);
    });

    it('answers 403, not 400, to a non-admin who sends invalid parameters', async () => {
      await request(http).get(`${URL}?days=14`).set('Cookie', aliceCookie).expect(403);
      await request(http).get(`${URL}?tz=Nowhere%2FLand`).set('Cookie', aliceCookie).expect(403);
    });

    it('answers 200 to an admin', async () => {
      await request(http).get(URL).set('Cookie', bossCookie).expect(200);
    });

    it('follows the role at once, for a session already open', async () => {
      await request(http).get(URL).set('Cookie', aliceCookie).expect(403);

      await prisma.user.update({ where: { id: alice.user.id }, data: { role: 'ADMIN' } });
      await request(http).get(URL).set('Cookie', aliceCookie).expect(200);

      await prisma.user.update({ where: { id: alice.user.id }, data: { role: 'USER' } });
      await request(http).get(URL).set('Cookie', aliceCookie).expect(403);
    });

    it('leaves the personal stats of every user as they were', async () => {
      await addCall(alice, hoursAgo(1));
      await addCall(bob, hoursAgo(1));

      const response = await request(http).get(ME_URL).set('Cookie', aliceCookie).expect(200);

      expect((response.body as { requests: number }).requests).toBe(1);
    });
  });

  describe('aggregation across users', () => {
    beforeEach(async () => {
      await addCall(alice, hoursAgo(5), {
        durationMs: 100,
        promptTokens: 10,
        completionTokens: 4,
      });
      await addCall(alice, hoursAgo(4), {
        durationMs: 300,
        timeToFirstTokenMs: null,
        outcome: LlmCallOutcome.ERROR,
        promptTokens: 6,
        completionTokens: 0,
      });
      await addCall(bob, hoursAgo(3), {
        durationMs: 200,
        promptTokens: 20,
        completionTokens: 8,
        tokensEstimated: false,
      });
      await addCall(bob, hoursAgo(2), {
        durationMs: 1_000,
        timeToFirstTokenMs: null,
        outcome: LlmCallOutcome.TIMEOUT,
        promptTokens: 4,
        completionTokens: 0,
      });
      await addCall(bob, hoursAgo(1), {
        durationMs: 50,
        outcome: LlmCallOutcome.INTERRUPTED,
        promptTokens: 3,
        completionTokens: 1,
      });
      await addCall(boss, hoursAgo(1), {
        durationMs: 150,
        promptTokens: 5,
        completionTokens: 2,
      });
    });

    it('covers the calls of every user, the admin included', async () => {
      const body = await getStats(bossCookie);

      expect(body.requests).toBe(6);
      expect(body.tokens.prompt).toEqual({ total: 48, estimated: 28, reported: 20 });
      expect(body.tokens.completion).toEqual({ total: 15, estimated: 7, reported: 8 });
      expect(body.averages).toEqual({ durationMs: 300, timeToFirstTokenMs: 10 });
      expect(body.outcomes).toEqual({
        completed: { count: 3, rate: 0.5 },
        interrupted: { count: 1, rate: 0.1667 },
        error: { count: 1, rate: 0.1667 },
        timeout: { count: 1, rate: 0.1667 },
      });
      expect(body.daily.reduce((total, day) => total + day.requests, 0)).toBe(6);
      expect(body.daily.reduce((total, day) => total + day.promptTokens, 0)).toBe(48);
    });

    it('counts the accounts that called the model as active', async () => {
      const body = await getStats(bossCookie);

      expect(body.activeUsers).toBe(3);
    });

    it('ranks every account, those that never called the model included', async () => {
      const body = await getStats(bossCookie);

      expect(body.users).toEqual([
        {
          email: bob.email,
          displayName: 'Bob',
          requests: 3,
          promptTokens: 27,
          completionTokens: 9,
          // One timeout out of three calls: the interrupted call is not a failure.
          failureRate: 0.3333,
        },
        {
          email: alice.email,
          displayName: 'Alice',
          requests: 2,
          promptTokens: 16,
          completionTokens: 4,
          failureRate: 0.5,
        },
        {
          email: boss.email,
          displayName: 'Boss',
          requests: 1,
          promptTokens: 5,
          completionTokens: 2,
          failureRate: 0,
        },
        {
          email: carol.email,
          displayName: 'Carol',
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          failureRate: 0,
        },
      ]);
    });

    it("is the sum of each user's own stats", async () => {
      const everyone = await getStats(bossCookie);
      const own = await Promise.all(
        [bossCookie, aliceCookie, bobCookie].map(async (cookie) => {
          const response = await request(http).get(ME_URL).set('Cookie', cookie).expect(200);
          return response.body as AdminStatsBody;
        }),
      );
      const total = (pick: (stats: AdminStatsBody) => number): number =>
        own.reduce((sum, stats) => sum + pick(stats), 0);

      expect(everyone.requests).toBe(total((stats) => stats.requests));
      expect(everyone.tokens.prompt.total).toBe(total((stats) => stats.tokens.prompt.total));
      expect(everyone.tokens.completion.total).toBe(
        total((stats) => stats.tokens.completion.total),
      );
      expect(everyone.outcomes.error.count).toBe(total((stats) => stats.outcomes.error.count));
      expect(everyone.outcomes.timeout.count).toBe(total((stats) => stats.outcomes.timeout.count));
    });
  });

  describe('what it exposes', () => {
    it('returns the figures and nothing else about an account', async () => {
      await addCall(alice, hoursAgo(1));

      const response = await request(http).get(URL).set('Cookie', bossCookie).expect(200);
      const body = response.body as AdminStatsBody;
      const text = JSON.stringify(body);

      expect(Object.keys(body).sort()).toEqual([
        'activeUsers',
        'averages',
        'daily',
        'outcomes',
        'period',
        'requests',
        'tokens',
        'users',
      ]);
      for (const entry of body.users) {
        expect(Object.keys(entry).sort()).toEqual([
          'completionTokens',
          'displayName',
          'email',
          'failureRate',
          'promptTokens',
          'requests',
        ]);
      }
      for (const account of await prisma.user.findMany()) {
        expect(text).not.toContain(account.passwordHash);
        expect(text).not.toContain(account.id);
      }
      expect(text).not.toMatch(/password|role/i);
    });
  });

  describe('period', () => {
    it('defaults to 30 days in UTC', async () => {
      const body = await getStats(bossCookie);

      expect(body.period).toMatchObject({ days: 30, timeZone: 'UTC' });
      expect(body.daily).toHaveLength(30);
      expect(body.period.to).toBe(localDate(new Date(), 'UTC'));
    });

    it.each([7, 30, 90])('covers %i days when asked', async (days) => {
      const body = await getStats(bossCookie, `?days=${days}`);

      expect(body.period.days).toBe(days);
      expect(body.daily).toHaveLength(days);
    });

    it('only counts the calls of the period, in the totals and in the ranking', async () => {
      await addCall(alice, daysAgo(2));
      await addCall(bob, daysAgo(20));
      await addCall(carol, daysAgo(60));

      const week = await getStats(bossCookie, '?days=7');
      const month = await getStats(bossCookie, '?days=30');
      const quarter = await getStats(bossCookie, '?days=90');

      expect([week.requests, month.requests, quarter.requests]).toEqual([1, 2, 3]);
      expect([week.activeUsers, month.activeUsers, quarter.activeUsers]).toEqual([1, 2, 3]);
      expect(entryOf(week, bob)?.requests).toBe(0);
      expect(entryOf(month, bob)?.requests).toBe(1);
      expect(entryOf(month, carol)?.requests).toBe(0);
      expect(entryOf(quarter, carol)?.requests).toBe(1);
      for (const body of [week, month, quarter]) {
        expect(body.users).toHaveLength(4);
      }
    });
  });

  describe('time zone', () => {
    it('cuts the days in the requested time zone', async () => {
      // 23:30 UTC on the previous UTC day: already "today" in Paris (UTC+1 or UTC+2).
      const startOfUtcDay = new Date(`${localDate(new Date(), 'UTC')}T00:00:00Z`);
      await addCall(bob, new Date(startOfUtcDay.getTime() - 30 * 60 * 1000));

      const inUtc = await getStats(bossCookie, '?tz=UTC');
      const inParis = await getStats(bossCookie, '?tz=Europe%2FParis');

      expect(inParis.period.timeZone).toBe('Europe/Paris');
      expect(inUtc.daily.find((day) => day.requests === 1)?.date).toBe(
        localDate(new Date(startOfUtcDay.getTime() - 1), 'UTC'),
      );
      expect(inParis.daily.find((day) => day.requests === 1)?.date).toBe(
        localDate(startOfUtcDay, 'UTC'),
      );
      expect(entryOf(inUtc, bob)?.requests).toBe(1);
      expect(entryOf(inParis, bob)?.requests).toBe(1);
    });

    it('ends the period on the local "today" of the time zone', async () => {
      const kiritimati = await getStats(bossCookie, '?tz=Pacific%2FKiritimati');
      const niue = await getStats(bossCookie, '?tz=Pacific%2FNiue');

      expect(kiritimati.period.to).toBe(localDate(new Date(), 'Pacific/Kiritimati'));
      expect(niue.period.to).toBe(localDate(new Date(), 'Pacific/Niue'));
    });
  });

  describe('an instance without any call', () => {
    it('gets zeros, a full series and every account', async () => {
      const body = await getStats(bossCookie, '?days=7');

      expect(body).toMatchObject({
        requests: 0,
        tokens: { prompt: { total: 0 }, completion: { total: 0 } },
        averages: { durationMs: null, timeToFirstTokenMs: null },
        activeUsers: 0,
      });
      expect(body.daily).toHaveLength(7);
      expect(body.users).toHaveLength(4);
      expect(body.users.every((entry) => entry.requests === 0)).toBe(true);
    });
  });

  describe('invalid parameters', () => {
    it.each(['days=0', 'days=14', 'days=365', 'days=abc', 'days=', 'days=7&days=30', 'days=-7'])(
      'answers 400 for ?%s',
      async (query) => {
        const response = await request(http).get(`${URL}?${query}`).set('Cookie', bossCookie);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ message: 'Validation failed' });
      },
    );

    it.each([
      'tz=Nowhere%2FLand',
      'tz=Paris',
      'tz=CET',
      'tz=',
      "tz=Europe%2FParis'%3B%20DROP%20TABLE%20users%3B--",
    ])('answers 400 for ?%s', async (query) => {
      const response = await request(http).get(`${URL}?${query}`).set('Cookie', bossCookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ message: 'Validation failed' });
    });
  });
});
