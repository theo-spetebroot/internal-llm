import { Prisma } from '../generated/prisma/client.js';

/**
 * SQL fragments shared by every stats query over `llm_calls`, so that the per-user and the
 * instance-wide figures are computed by the same expressions. Each query keeps its own `WHERE`
 * on the user (or the lack of it) and its own `GROUP BY`.
 *
 * Time stamps are `timestamp without time zone` holding UTC: `x AT TIME ZONE 'UTC'` makes them
 * absolute, and a second `AT TIME ZONE <tz>` gives the local wall clock.
 */

/**
 * One row per local day, by the day the call started (to be used with `GROUP BY 1`). Calls
 * without a token figure (NULL) count as requests but add no token.
 */
export function callDayColumns(timeZone: string): Prisma.Sql {
  return Prisma.sql`
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
        coalesce(sum(completion_tokens) FILTER (WHERE NOT tokens_estimated), 0)::float8 AS "completionReported"`;
}

/**
 * Lower bound of the period: the UTC instant of the first day's local midnight. It is constant
 * for the query, so the indexes on `started_at` are used.
 */
export function startedFrom(firstDay: string, timeZone: string): Prisma.Sql {
  return Prisma.sql`started_at >= ((${firstDay}::date)::timestamp AT TIME ZONE ${timeZone}::text) AT TIME ZONE 'UTC'`;
}
