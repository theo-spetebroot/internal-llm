import type { StatsDailyPointDto, StatsQuery, UserStatsDto } from './stats.schemas.js';

/** LLM calls of one local day, as aggregated by the database. */
export interface CallDayRow {
  day: string;
  requests: number;
  durationSum: number;
  /** Calls that produced a first token (the others have no time to first token). */
  firstTokenCount: number;
  firstTokenSum: number;
  completed: number;
  interrupted: number;
  error: number;
  timeout: number;
  /** Tokens of the calls that have a figure, split by origin. */
  promptEstimated: number;
  promptReported: number;
  completionEstimated: number;
  completionReported: number;
}

interface UserStatsInput {
  query: StatsQuery;
  /** Every day of the period, oldest first. */
  days: string[];
  calls: CallDayRow[];
}

const RATE_PRECISION = 10_000;

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function average(total: number, count: number): number | null {
  return count === 0 ? null : Math.round(total / count);
}

/**
 * Turns the per-day rows into the response: one daily point per day of the period (zeros when
 * nothing happened) and the totals of those same days. Rows outside the period are ignored.
 */
export function buildUserStats({ query, days, calls }: UserStatsInput): UserStatsDto {
  const callsByDay = new Map(calls.map((row) => [row.day, row]));
  const callRows = days.flatMap((day) => callsByDay.get(day) ?? []);

  const daily: StatsDailyPointDto[] = days.map((date) => {
    const call = callsByDay.get(date);
    return {
      date,
      requests: call?.requests ?? 0,
      promptTokens: (call?.promptEstimated ?? 0) + (call?.promptReported ?? 0),
      completionTokens: (call?.completionEstimated ?? 0) + (call?.completionReported ?? 0),
    };
  });

  const requests = sum(callRows, (row) => row.requests);
  const outcome = (count: number) => ({
    count,
    rate: requests === 0 ? 0 : Math.round((count / requests) * RATE_PRECISION) / RATE_PRECISION,
  });
  const tokenCounts = (estimated: number, reported: number) => ({
    total: estimated + reported,
    estimated,
    reported,
  });

  return {
    period: {
      days: query.days,
      timeZone: query.tz,
      from: days[0] ?? '',
      to: days.at(-1) ?? '',
    },
    requests,
    tokens: {
      prompt: tokenCounts(
        sum(callRows, (row) => row.promptEstimated),
        sum(callRows, (row) => row.promptReported),
      ),
      completion: tokenCounts(
        sum(callRows, (row) => row.completionEstimated),
        sum(callRows, (row) => row.completionReported),
      ),
    },
    averages: {
      durationMs: average(
        sum(callRows, (row) => row.durationSum),
        requests,
      ),
      timeToFirstTokenMs: average(
        sum(callRows, (row) => row.firstTokenSum),
        sum(callRows, (row) => row.firstTokenCount),
      ),
    },
    outcomes: {
      completed: outcome(sum(callRows, (row) => row.completed)),
      interrupted: outcome(sum(callRows, (row) => row.interrupted)),
      error: outcome(sum(callRows, (row) => row.error)),
      timeout: outcome(sum(callRows, (row) => row.timeout)),
    },
    daily,
  };
}
