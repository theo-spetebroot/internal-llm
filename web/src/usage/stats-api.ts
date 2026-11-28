import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/api/client';
import type { components } from '@/api/schema';

import type { UsagePeriod } from './usage-period';

export type UserStats = components['schemas']['UserStats'];
/** The figures of the whole instance: those of `UserStats`, plus the users' ranking. */
export type AdminStats = components['schemas']['AdminStats'];
export type RankingEntry = components['schemas']['StatsUserRankingEntry'];
/** One day of the per-day series. */
export type DailyPoint = components['schemas']['StatsDailyPoint'];

/** What the stats routes take: the period, and the time zone the days are cut in. */
export interface StatsQuery {
  days: UsagePeriod;
  tz: string;
}

export const statsKeys = {
  all: ['stats'] as const,
  me: (query: StatsQuery) => [...statsKeys.all, 'me', query] as const,
  admin: (query: StatsQuery) => [...statsKeys.all, 'admin', query] as const,
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

/**
 * The usage of the whole instance (admins only: any other user is refused with a 403). Only
 * asked for while `enabled`, i.e. while the instance view is open. Like `useMyStats`, it keeps
 * the previous period on screen while another one loads.
 */
export function useAdminStats(query: StatsQuery, enabled: boolean) {
  return useQuery({
    queryKey: statsKeys.admin(query),
    queryFn: async (): Promise<AdminStats> => {
      const { data, response } = await api.GET('/api/admin/stats', { params: { query } });
      if (!data) throw new ApiError(response.status);
      return data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}
