/** Periods the usage page can cover, in days (today included): those of the API. */
export const USAGE_PERIODS = [7, 30, 90] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export const DEFAULT_USAGE_PERIOD: UsagePeriod = 30;

/** Search parameter holding the period, e.g. `/usage?periode=7` (absent: the default). */
export const PERIOD_PARAM = 'periode';

/** The period named by a search parameter; anything unknown falls back to the default. */
export function parsePeriod(value: string | null): UsagePeriod {
  return USAGE_PERIODS.find((days) => String(days) === value) ?? DEFAULT_USAGE_PERIOD;
}
