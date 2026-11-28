import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/api/client';
import type { components } from '@/api/schema';

import type { UsagePeriod } from './usage-period';

export type UserStats = components['schemas']['UserStats'];

/** What the stats routes take: the period, and the time zone the days are cut in. */
export interface StatsQuery {
  days: UsagePeriod;
  tz: string;
}

export const statsKeys = {
  all: ['stats'] as const,
  me: (query: StatsQuery) => [...statsKeys.all, 'me', query] as const,
};

/**
 * The signed-in user's own usage. While another period loads, the previous figures stay on
 * screen (`isPlaceholderData`), so that the page does not flash back to its loading state.
 */
export function useMyStats(query: StatsQuery) {
  return useQuery({
    queryKey: statsKeys.me(query),
    queryFn: async (): Promise<UserStats> => {
      const { data, response } = await api.GET('/api/stats/me', { params: { query } });
      if (!data) throw new ApiError(response.status);
      return data;
    },
    placeholderData: keepPreviousData,
  });
}
