import type { UserStats } from '@/usage/stats-api';
import type { UsagePeriod } from '@/usage/usage-period';

/** Last day ("today") of the periods built here. */
export const STATS_TO = '2026-11-28';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `days` calendar days ending on `to`, oldest first (YYYY-MM-DD). */
export function lastDays(to: string, days: number): string[] {
  const end = Date.parse(`${to}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) =>
    new Date(end - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
}

export interface UserStatsOptions {
  days?: UsagePeriod;
  timeZone?: string;
  /** Requests of each day of the period (index 0 is the oldest day). Default: none. */
  requestsPerDay?: (index: number) => number;
}

const noOutcome = { count: 0, rate: 0 };

/**
 * Stats as the API sends them. By default: no activity. `requestsPerDay` fills the daily
 * series (100 prompt and 40 completion tokens per request, all estimated, all completed);
 * any other field can be overridden as a whole.
 */
export function makeUserStats(options: UserStatsOptions & Partial<UserStats> = {}): UserStats {
  const { days = 30, timeZone = 'Europe/Paris', requestsPerDay = () => 0, ...overrides } = options;
  const dates = lastDays(STATS_TO, days);
  const daily = dates.map((date, index) => {
    const requests = requestsPerDay(index);
    return { date, requests, promptTokens: requests * 100, completionTokens: requests * 40 };
  });
  const sum = (pick: (point: (typeof daily)[number]) => number) =>
    daily.reduce((total, point) => total + pick(point), 0);
  const requests = sum((point) => point.requests);
  const prompt = sum((point) => point.promptTokens);
  const completion = sum((point) => point.completionTokens);

  return {
    period: { days, timeZone, from: dates[0] ?? STATS_TO, to: STATS_TO },
    requests,
    tokens: {
      prompt: { total: prompt, estimated: prompt, reported: 0 },
      completion: { total: completion, estimated: completion, reported: 0 },
    },
    averages: {
      durationMs: requests > 0 ? 3400 : null,
      timeToFirstTokenMs: requests > 0 ? 620 : null,
    },
    outcomes: {
      completed: { count: requests, rate: requests > 0 ? 1 : 0 },
      interrupted: noOutcome,
      error: noOutcome,
      timeout: noOutcome,
    },
    daily,
    ...overrides,
  };
}
