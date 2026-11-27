import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { purgeLlmCalls } from './llm-call.purge.js';

export const PURGE_JOB_NAME = 'llm-call-purge';

/** Every day at 03:00. */
export const PURGE_SCHEDULE = '0 3 * * *';

/**
 * Deletes the recorded LLM calls older than `LLM_CALL_RETENTION_DAYS` once a day, at 03:00 UTC
 * (the zone is fixed so that the hour does not depend on the machine running the API).
 * A failure is logged, never thrown: the next run simply tries again.
 */
@Injectable()
export class LlmCallPurgeTask {
  private readonly logger = new Logger(LlmCallPurgeTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(PURGE_SCHEDULE, { name: PURGE_JOB_NAME, timeZone: 'UTC' })
  async run(): Promise<void> {
    const retentionDays = this.config.get('LLM_CALL_RETENTION_DAYS', { infer: true });
    try {
      const { deleted, cutoff } = await purgeLlmCalls(this.prisma, retentionDays);
      this.logger.log(
        `Purged ${deleted} LLM call record(s) started before ${cutoff.toISOString()} ` +
          `(retention: ${retentionDays} days)`,
      );
    } catch (error) {
      this.logger.error(
        `Could not purge the old LLM call records: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
