import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { cn } from '@/lib/utils';
import { PageHeader } from '@/layout/PageHeader';

import { ActivityCharts } from './ActivityCharts';
import { KeyFigures } from './KeyFigures';
import { OutcomeBreakdown } from './OutcomeBreakdown';
import { PeriodSelector } from './PeriodSelector';
import { useMyStats } from './stats-api';
import { browserTimeZone } from './time-zone';
import { formatDayRange } from './usage-format';
import { DEFAULT_USAGE_PERIOD, parsePeriod, PERIOD_PARAM, type UsagePeriod } from './usage-period';
import { UsageEmpty, UsageError, UsageSkeleton } from './UsageStates';

/** Usage of the model: the signed-in user's own figures over a period. */
export function UsagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get(PERIOD_PARAM));
  // The days are cut in the browser's time zone; it does not change while the page is open.
  const [timeZone] = useState(browserTimeZone);
  const stats = useMyStats({ days: period, tz: timeZone });

  // The period lives in the URL, so that a link keeps it and the back button restores it.
  const selectPeriod = (days: UsagePeriod) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (days === DEFAULT_USAGE_PERIOD) next.delete(PERIOD_PARAM);
      else next.set(PERIOD_PARAM, String(days));
      return next;
    });
  };

  let content;
  if (stats.isPending) {
    content = <UsageSkeleton />;
  } else if (stats.isError) {
    content = (
      <UsageError
        message="Les chiffres n’ont pas pu être chargés. Réessayez dans un instant."
        retrying={stats.isFetching}
        onRetry={() => {
          void stats.refetch();
        }}
      />
    );
  } else if (stats.data.requests === 0) {
    content = <UsageEmpty period={period} onShowLongerPeriod={selectPeriod} />;
  } else {
    content = (
      <div
        aria-busy={stats.isPlaceholderData}
        className={cn(
          'flex flex-col gap-3.5 transition-opacity',
          stats.isPlaceholderData && 'opacity-60',
        )}
      >
        <KeyFigures stats={stats.data} />
        <ActivityCharts stats={stats.data} />
        <OutcomeBreakdown outcomes={stats.data.outcomes} />
      </div>
    );
  }

  return (
    <>
      <title>Usage · internal-llm</title>
      <PageHeader title="Usage" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 md:px-8">
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {stats.data && (
              <span className="text-[13px] text-ink-3">
                {formatDayRange(stats.data.period.from, stats.data.period.to)} ·{' '}
                {stats.data.period.timeZone}
              </span>
            )}
            <PeriodSelector value={period} onChange={selectPeriod} />
          </div>
          {content}
        </div>
      </div>
    </>
  );
}
