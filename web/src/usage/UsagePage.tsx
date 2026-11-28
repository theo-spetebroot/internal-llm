import { type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { ApiError } from '@/api/client';
import { useCurrentUser } from '@/auth/current-user';
import { sessionQueryKey } from '@/auth/session';
import { PageHeader } from '@/layout/PageHeader';
import { cn } from '@/lib/utils';

import { ActivityCharts } from './ActivityCharts';
import { InstanceView } from './InstanceView';
import { KeyFigures } from './KeyFigures';
import { OutcomeBreakdown } from './OutcomeBreakdown';
import { PeriodSelector } from './PeriodSelector';
import { useAdminStats, useMyStats, type UserStats } from './stats-api';
import { browserTimeZone } from './time-zone';
import { formatDayRange } from './usage-format';
import { DEFAULT_USAGE_PERIOD, parsePeriod, PERIOD_PARAM, type UsagePeriod } from './usage-period';
import { parseView, type UsageView, VIEW_PARAM } from './usage-view';
import { UsageEmpty, UsageError, UsageSkeleton } from './UsageStates';

interface StatsPanelProps<T extends UserStats> {
  query: UseQueryResult<T>;
  period: UsagePeriod;
  onShowLongerPeriod: (days: UsagePeriod) => void;
  children: (stats: T) => ReactNode;
}

/** The loading, error and empty states around the figures of one view. */
function StatsPanel<T extends UserStats>({
  query,
  period,
  onShowLongerPeriod,
  children,
}: StatsPanelProps<T>) {
  if (query.isPending) return <UsageSkeleton />;

  if (query.isError) {
    // A refusal answers the same again: no retry (the session is refreshed instead).
    const refused = query.error instanceof ApiError && query.error.status === 403;
    return refused ? (
      <UsageError message="Cette vue est réservée aux administrateurs." />
    ) : (
      <UsageError
        message="Les chiffres n’ont pas pu être chargés. Réessayez dans un instant."
        retrying={query.isFetching}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (query.data.requests === 0) {
    return <UsageEmpty period={period} onShowLongerPeriod={onShowLongerPeriod} />;
  }

  return (
    <div
      aria-busy={query.isPlaceholderData}
      className={cn(
        'flex flex-col gap-3.5 transition-opacity',
        query.isPlaceholderData && 'opacity-60',
      )}
    >
      {children(query.data)}
    </div>
  );
}

const TAB_CLASS =
  '-mb-px h-11 cursor-pointer border-b-2 border-transparent text-[15px] font-medium text-ink-3 transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink';

/**
 * Usage of the model over a period: the signed-in user's own figures, and, for admins only, a
 * second view with the whole instance's. The period and the view live in the address.
 */
export function UsagePage() {
  const user = useCurrentUser();
  const isAdmin = user.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get(PERIOD_PARAM));
  const view = parseView(searchParams.get(VIEW_PARAM), isAdmin);
  // The days are cut in the browser's time zone; it does not change while the page is open.
  const [timeZone] = useState(browserTimeZone);
  const query = { days: period, tz: timeZone };
  const mine = useMyStats(query);
  const instance = useAdminStats(query, view === 'instance');

  // Refused although the session says admin: the role was removed since. Reload the session,
  // which hides the instance view.
  const refused = instance.error instanceof ApiError && instance.error.status === 403;
  useEffect(() => {
    if (refused) void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  }, [refused, queryClient]);

  // The period and the view live in the URL, so that a link keeps them and back restores them.
  const select = (param: string, value: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(param);
      else next.set(param, value);
      return next;
    });
  };
  const selectPeriod = (days: UsagePeriod) => {
    select(PERIOD_PARAM, days === DEFAULT_USAGE_PERIOD ? null : String(days));
  };
  const selectView = (next: UsageView) => {
    select(VIEW_PARAM, next === 'instance' ? 'instance' : null);
  };

  const range = (view === 'instance' ? instance : mine).data?.period;
  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      {range && (
        <span className="text-[13px] text-ink-3">
          {formatDayRange(range.from, range.to)} · {range.timeZone}
        </span>
      )}
      <PeriodSelector value={period} onChange={selectPeriod} />
    </div>
  );

  const ownPanel = (
    <StatsPanel query={mine} period={period} onShowLongerPeriod={selectPeriod}>
      {(stats) => (
        <>
          <KeyFigures stats={stats} />
          <ActivityCharts stats={stats} />
          <OutcomeBreakdown outcomes={stats.outcomes} />
        </>
      )}
    </StatsPanel>
  );

  return (
    <>
      <title>Usage · internal-llm</title>
      <PageHeader title="Usage" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 md:px-8">
          {isAdmin ? (
            <Tabs.Root
              value={view}
              onValueChange={(next) => {
                selectView(parseView(next, true));
              }}
              className="flex flex-col gap-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule">
                <Tabs.List aria-label="Portée des chiffres" className="flex gap-6">
                  <Tabs.Trigger value="moi" className={TAB_CLASS}>
                    Mon usage
                  </Tabs.Trigger>
                  <Tabs.Trigger value="instance" className={TAB_CLASS}>
                    Instance
                  </Tabs.Trigger>
                </Tabs.List>
                <div className="ml-auto pb-2.5">{controls}</div>
              </div>
              <Tabs.Content value="moi">{ownPanel}</Tabs.Content>
              <Tabs.Content value="instance">
                <StatsPanel query={instance} period={period} onShowLongerPeriod={selectPeriod}>
                  {(stats) => <InstanceView stats={stats} />}
                </StatsPanel>
              </Tabs.Content>
            </Tabs.Root>
          ) : (
            <>
              <div className="flex justify-end">{controls}</div>
              {ownPanel}
            </>
          )}
        </div>
      </div>
    </>
  );
}
