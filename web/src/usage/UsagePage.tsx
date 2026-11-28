import { useSearchParams } from 'react-router';

import { PageHeader } from '@/layout/PageHeader';

import { PeriodSelector } from './PeriodSelector';
import { DEFAULT_USAGE_PERIOD, parsePeriod, PERIOD_PARAM, type UsagePeriod } from './usage-period';

/** Usage of the model: the signed-in user's own figures over a period. */
export function UsagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get(PERIOD_PARAM));

  // The period lives in the URL, so that a link keeps it and the back button restores it.
  const selectPeriod = (days: UsagePeriod) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (days === DEFAULT_USAGE_PERIOD) next.delete(PERIOD_PARAM);
      else next.set(PERIOD_PARAM, String(days));
      return next;
    });
  };

  return (
    <>
      <title>Usage · internal-llm</title>
      <PageHeader title="Usage" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 md:px-8">
          <div className="flex justify-end">
            <PeriodSelector value={period} onChange={selectPeriod} />
          </div>
        </div>
      </div>
    </>
  );
}
