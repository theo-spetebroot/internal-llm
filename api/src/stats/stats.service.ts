import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { buildAdminStats, type UserCallsRow } from './admin-stats.js';
import type { AdminStatsDto, StatsQuery, UserStatsDto } from './stats.schemas.js';
import { callDayColumns, startedFrom } from './stats.sql.js';
import { addDays, lastDays, localDate } from './time-zone.js';
import { buildUsageStats, type CallDayRow } from './usage-stats.js';

/**
 * Usage figures computed from the recorded LLM calls (`llm_calls`): requests, durations,
 * outcomes and tokens. Tokens live on the call itself, not on the messages, so deleting a
 * conversation changes none of the figures. Days are cut in the requested time zone, by the
 * database (see `stats.sql.ts` for the SQL shared by the stats queries).
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The usage of one user. The query filters on the user itself, so a user can only ever count
   * their own data. `now` only exists so that tests can pin the clock.
   */
  async getUserStats(userId: string, query: StatsQuery, now = new Date()): Promise<UserStatsDto> {
    const { days, firstDay } = this.period(query, now);

    const calls = await this.callsPerDay(userId, firstDay, query.tz);
    return buildUsageStats({ query, days, calls });
  }

  /**
   * The usage of the whole instance, with a ranking of the accounts. It filters on no user by
   * design: only call it for an admin.
   */
  async getAdminStats(query: StatsQuery, now = new Date()): Promise<AdminStatsDto> {
    const { days, firstDay } = this.period(query, now);

    const [calls, users] = await Promise.all([
      this.allCallsPerDay(firstDay, query.tz),
      this.callsPerUser(firstDay, query.tz),
    ]);
    return buildAdminStats({ query, days, calls, users });
  }

  /** The days of the period (today included, in the time zone) and the first of them. */
  private period(query: StatsQuery, now: Date): { days: string[]; firstDay: string } {
    const today = localDate(now, query.tz);
    return { days: lastDays(today, query.days), firstDay: addDays(today, 1 - query.days) };
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

  /** The same rows, over the calls of every user. */
  private allCallsPerDay(firstDay: string, timeZone: string): Promise<CallDayRow[]> {
    return this.prisma.$queryRaw<CallDayRow[]>`
      SELECT ${callDayColumns(timeZone)}
      FROM llm_calls
      WHERE ${startedFrom(firstDay, timeZone)}
      GROUP BY 1
      ORDER BY 1`;
  }

  /**
   * One row per account, with its calls of the period: the join keeps the accounts that made
   * none (at 0). A timeout counts as a failure next to an error; a call the caller interrupted
   * does not.
   */
  private callsPerUser(firstDay: string, timeZone: string): Promise<UserCallsRow[]> {
    return this.prisma.$queryRaw<UserCallsRow[]>`
      SELECT
        u.email AS "email",
        u.display_name AS "displayName",
        count(c.id)::float8 AS "requests",
        coalesce(sum(c.prompt_tokens), 0)::float8 AS "promptTokens",
        coalesce(sum(c.completion_tokens), 0)::float8 AS "completionTokens",
        (count(c.id) FILTER (WHERE c.outcome IN ('ERROR', 'TIMEOUT')))::float8 AS "failed"
      FROM users u
      LEFT JOIN llm_calls c
        ON c.user_id = u.id
        AND ${startedFrom(firstDay, timeZone)}
      GROUP BY u.id`;
  }
}
