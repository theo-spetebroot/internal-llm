import type { AdminStatsDto, StatsQuery, UserRankingEntryDto } from './stats.schemas.js';
import { buildUsageStats, type CallDayRow, rate } from './usage-stats.js';

/** The calls of one account over the period, as aggregated by the database. */
export interface UserCallsRow {
  email: string;
  displayName: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  /** Calls that ended in an error or a timeout. */
  failed: number;
}

interface AdminStatsInput {
  query: StatsQuery;
  /** Every day of the period, oldest first. */
  days: string[];
  /** The calls of every user, per day. */
  calls: CallDayRow[];
  /** One row per account, those without any call included. */
  users: UserCallsRow[];
}

/** Most requests first; accounts with as many requests are ordered by email. */
function byRankThenEmail(a: UserCallsRow, b: UserCallsRow): number {
  if (a.requests !== b.requests) return b.requests - a.requests;
  return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
}

/**
 * The instance-wide response: the figures of `buildUsageStats` (the same ones as the per-user
 * stats, over every call) and the per-user ranking.
 */
export function buildAdminStats({ query, days, calls, users }: AdminStatsInput): AdminStatsDto {
  const ranking: UserRankingEntryDto[] = [...users].sort(byRankThenEmail).map((user) => ({
    email: user.email,
    displayName: user.displayName,
    requests: user.requests,
    promptTokens: user.promptTokens,
    completionTokens: user.completionTokens,
    failureRate: rate(user.failed, user.requests),
  }));

  return {
    ...buildUsageStats({ query, days, calls }),
    activeUsers: ranking.filter((user) => user.requests > 0).length,
    users: ranking,
  };
}
