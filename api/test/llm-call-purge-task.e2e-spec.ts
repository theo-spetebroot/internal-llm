import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/config/env.schema.js';
import { LlmCallOutcome } from '../src/generated/prisma/enums.js';
import { LlmCallPurgeTask, PURGE_JOB_NAME } from '../src/llm/llm-call.purge-task.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

/** Configuration with a given retention, in place of the (default) one of the test run. */
const configWith = (retentionDays: number) =>
  ({ get: () => retentionDays }) as unknown as ConfigService<Env, true>;

describe('LlmCallPurgeTask', () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function addCall(startedAt: Date) {
    return prisma.llmCall.create({
      data: {
        userId,
        provider: 'mock',
        startedAt,
        durationMs: 100,
        outcome: LlmCallOutcome.COMPLETED,
      },
    });
  }

  describe('schedule', () => {
    it('is registered to run every day at 03:00 UTC', () => {
      const job = testApp.app.get(SchedulerRegistry).getCronJob(PURGE_JOB_NAME);

      const [first, second] = job.nextDates(2);
      expect(first?.setZone('utc').hour).toBe(3);
      expect(first?.setZone('utc').minute).toBe(0);
      expect(first?.setZone('utc').second).toBe(0);
      expect((second?.toMillis() ?? 0) - (first?.toMillis() ?? 0)).toBe(DAY_MS);
    });
  });

  describe('run()', () => {
    it('purges with the retention of the default configuration (90 days)', async () => {
      await addCall(daysAgo(120));
      await addCall(daysAgo(60));

      await testApp.app.get(LlmCallPurgeTask).run();

      expect(await prisma.llmCall.count()).toBe(1);
    });

    it('purges with the configured retention', async () => {
      await addCall(daysAgo(45));
      await addCall(daysAgo(10));

      await new LlmCallPurgeTask(prisma, configWith(30)).run();

      const remaining = await prisma.llmCall.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.startedAt.getTime()).toBeGreaterThan(daysAgo(30).getTime());
    });

    it('logs how many records it deleted', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await addCall(daysAgo(200));
      await addCall(daysAgo(100));
      await addCall(daysAgo(1));

      await new LlmCallPurgeTask(prisma, configWith(30)).run();

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Purged 2 LLM call record(s)'));
    });

    it('logs zero when there is nothing to delete', async () => {
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await new LlmCallPurgeTask(prisma, configWith(30)).run();

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Purged 0 LLM call record(s)'));
    });

    it('logs a failure instead of throwing, so that the next run can try again', async () => {
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      vi.spyOn(prisma.llmCall, 'deleteMany').mockRejectedValueOnce(new Error('db down'));

      await expect(new LlmCallPurgeTask(prisma, configWith(30)).run()).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('db down'));
    });
  });
});
