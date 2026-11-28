import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { StatsQuery, UserStatsDto } from './stats.schemas.js';
import { callDayColumns, startedFrom } from './stats.sql.js';
import { addDays, lastDays, localDate } from './time-zone.js';
import { buildUsageStats, type CallDayRow } from './usage-stats.js';

/**
 * Usage figures of one user, all computed from the recorded LLM calls (`llm_calls`): requests,
 * durations, outcomes and tokens. Tokens live on the call itself, not on the messages, so
 * deleting a conversation changes none of the figures. The query filters on the user itself, so
 * a user can only ever count their own data. Days are cut in the requested time zone, by the
 * database (see `stats.sql.ts` for the SQL shared by the stats queries).
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `now` only exists so that tests can pin the clock. */
  async getUserStats(userId: string, query: StatsQuery, now = new Date()): Promise<UserStatsDto> {
    const today = localDate(now, query.tz);
    const days = lastDays(today, query.days);
    const firstDay = addDays(today, 1 - query.days);

    const calls = await this.callsPerDay(userId, firstDay, query.tz);
    return buildUsageStats({ query, days, calls });
  }

  /** One row per local day, by the day the call started. */
  private callsPerDay(userId: string, firstDay: string, timeZone: string): Promise<CallDayRow[]> {
    return this.prisma.$queryRaw<CallDayRow[]>`
      SELECT ${callDayColumns(timeZone)}
      FROM llm_calls
      WHERE user_id = ${userId}
        AND ${startedFrom(firstDay, timeZone)}
      GROUP BY 1
      ORDER BY 1`;
  }
}
