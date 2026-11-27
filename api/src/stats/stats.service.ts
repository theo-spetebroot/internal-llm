import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { StatsQuery, UserStatsDto } from './stats.schemas.js';
import { addDays, lastDays, localDate } from './time-zone.js';
import { buildUserStats, type CallDayRow, type TokenDayRow } from './user-stats.js';

/**
 * Usage figures of one user. Every query filters on the user itself, so a user can only ever
 * count their own data. Days are cut in the requested time zone, by the database.
 *
 * Time stamps are `timestamp without time zone` holding UTC: `x AT TIME ZONE 'UTC'` makes them
 * absolute, and a second `AT TIME ZONE <tz>` gives the local wall clock, whose date is the day.
 * The lower bound of the period is the UTC instant of the first day's local midnight; it is
 * constant for the query, so the (user, date) indexes of `llm_calls` and the (conversation,
 * date) index of `messages` are used.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `now` only exists so that tests can pin the clock. */
  async getUserStats(userId: string, query: StatsQuery, now = new Date()): Promise<UserStatsDto> {
    const today = localDate(now, query.tz);
    const days = lastDays(today, query.days);
    const firstDay = addDays(today, 1 - query.days);

    const [calls, tokens] = await Promise.all([
      this.callsPerDay(userId, firstDay, query.tz),
      this.tokensPerDay(userId, firstDay, query.tz),
    ]);
    return buildUserStats({ query, days, calls, tokens });
  }

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
        (count(*) FILTER (WHERE outcome = 'TIMEOUT'))::float8 AS "timeout"
      FROM llm_calls
      WHERE user_id = ${userId}
        AND started_at >= ((${firstDay}::date)::timestamp AT TIME ZONE ${timeZone}::text) AT TIME ZONE 'UTC'
      GROUP BY 1
      ORDER BY 1`;
  }

  /**
   * Tokens live on the assistant messages, which belong to a user through their conversation.
   * Deleting a conversation deletes its messages, and their tokens with them.
   */
  private tokensPerDay(userId: string, firstDay: string, timeZone: string): Promise<TokenDayRow[]> {
    return this.prisma.$queryRaw<TokenDayRow[]>`
      SELECT
        ((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date::text AS "day",
        coalesce(sum(m.prompt_tokens) FILTER (WHERE m.tokens_estimated), 0)::float8 AS "promptEstimated",
        coalesce(sum(m.prompt_tokens) FILTER (WHERE NOT m.tokens_estimated), 0)::float8 AS "promptReported",
        coalesce(sum(m.completion_tokens) FILTER (WHERE m.tokens_estimated), 0)::float8 AS "completionEstimated",
        coalesce(sum(m.completion_tokens) FILTER (WHERE NOT m.tokens_estimated), 0)::float8 AS "completionReported"
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
        AND m.role = 'ASSISTANT'
        AND m.created_at >= ((${firstDay}::date)::timestamp AT TIME ZONE ${timeZone}::text) AT TIME ZONE 'UTC'
      GROUP BY 1
      ORDER BY 1`;
  }
}
