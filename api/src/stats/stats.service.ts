import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { StatsQuery, UserStatsDto } from './stats.schemas.js';
import { addDays, lastDays, localDate } from './time-zone.js';
import { buildUserStats, type CallDayRow } from './user-stats.js';

/**
 * Usage figures of one user, all computed from the recorded LLM calls (`llm_calls`): requests,
 * durations, outcomes and tokens. Tokens live on the call itself, not on the messages, so
 * deleting a conversation changes none of the figures. The query filters on the user itself, so
 * a user can only ever count their own data. Days are cut in the requested time zone, by the
 * database.
 *
 * Time stamps are `timestamp without time zone` holding UTC: `x AT TIME ZONE 'UTC'` makes them
 * absolute, and a second `AT TIME ZONE <tz>` gives the local wall clock, whose date is the day.
 * The lower bound of the period is the UTC instant of the first day's local midnight; it is
 * constant for the query, so the (user, date) index of `llm_calls` is used.
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
    return buildUserStats({ query, days, calls });
  }

  /**
   * One row per local day, by the day the call started. Calls without a token figure (NULL:
   * the model server was never reached, the caller left before any token, or the call was
   * recorded before the token columns existed) count as requests but add no token.
   */
  private callsPerDay(userId: string, firstDay: string, timeZone: string): Promise<CallDayRow[]> {
    return this.prisma.$queryRaw<CallDayRow[]>`
      SELECT
        ((started_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date::text AS "day",
        count(*)::float8 AS "requests",
        coalesce(sum(duration_ms), 0)::float8 AS "durationSum",
        count(time_to_first_token_ms)::float8 AS "firstTokenCount",
        coalesce(sum(time_to_first_token_ms), 0)::float8 AS "firstTokenSum",
        (count(*) FILTER (WHERE outcome = 'COMPLETED'))::float8 AS "completed",
        (count(*) FILTER (WHERE outcome = 'INTERRUPTED'))::float8 AS "interrupted",
        (count(*) FILTER (WHERE outcome = 'ERROR'))::float8 AS "error",
        (count(*) FILTER (WHERE outcome = 'TIMEOUT'))::float8 AS "timeout",
        coalesce(sum(prompt_tokens) FILTER (WHERE tokens_estimated), 0)::float8 AS "promptEstimated",
        coalesce(sum(prompt_tokens) FILTER (WHERE NOT tokens_estimated), 0)::float8 AS "promptReported",
        coalesce(sum(completion_tokens) FILTER (WHERE tokens_estimated), 0)::float8 AS "completionEstimated",
        coalesce(sum(completion_tokens) FILTER (WHERE NOT tokens_estimated), 0)::float8 AS "completionReported"
      FROM llm_calls
      WHERE user_id = ${userId}
        AND started_at >= ((${firstDay}::date)::timestamp AT TIME ZONE ${timeZone}::text) AT TIME ZONE 'UTC'
      GROUP BY 1
      ORDER BY 1`;
  }
}
