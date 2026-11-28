/**
 * French number, duration and date formats of the usage page. Spaces inside a figure are
 * no-break spaces, so that "1,28 M" or "3,4 s" never wraps in the middle.
 */
const NBSP = ' ';
const LOCALE = 'fr-FR';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const threeDigits = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 3 });

/** No figure to show (no data to average, nothing to rate). */
export const NO_FIGURE = '—';

/** An exact count, with thousands separators: 1 234 567. */
export function formatCount(count: number): string {
  return integer.format(count);
}

/** A token count, compact above a thousand: 950, 12,4 k, 1,28 M. */
export function formatTokens(count: number): string {
  if (count < 1_000) return integer.format(count);
  const thousands = Number((count / 1_000).toPrecision(3));
  if (thousands < 1_000) return `${threeDigits.format(thousands)}${NBSP}k`;
  return `${threeDigits.format(count / 1_000_000)}${NBSP}M`;
}

/** A duration given in milliseconds: 620 ms, 3,4 s, 1 min 5 s; `—` without data. */
export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return NO_FIGURE;
  const rounded = Math.round(milliseconds);
  if (rounded < 1_000) return `${integer.format(rounded)}${NBSP}ms`;

  const tenthsOfSeconds = Math.round(milliseconds / 100);
  if (tenthsOfSeconds < 600) return `${oneDecimal.format(tenthsOfSeconds / 10)}${NBSP}s`;

  const totalSeconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}${NBSP}min` : `${minutes}${NBSP}min${NBSP}${seconds}${NBSP}s`;
}

/** A share between 0 and 1, as a percentage: 5,8 %. Never shows 0 % for a non-zero share. */
export function formatPercent(rate: number): string {
  const percent = rate * 100;
  if (percent > 0 && percent < 0.05) return `<${NBSP}0,1${NBSP}%`;
  return `${oneDecimal.format(percent)}${NBSP}%`;
}

/** The average number of requests per day, e.g. "≈ 14 par jour". */
export function formatPerDay(requests: number, days: number): string {
  const perDay = requests / days;
  const shown = perDay >= 10 ? integer.format(perDay) : oneDecimal.format(perDay);
  return `≈${NBSP}${shown} par jour`;
}

const shortDay = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longDay = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A calendar day as the API sends it (YYYY-MM-DD). Days carry no time zone: read as UTC. */
function parseDay(day: string): Date | null {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "28 nov." */
export function formatDay(day: string): string {
  const date = parseDay(day);
  return date ? shortDay.format(date) : day;
}

/** "vendredi 28 novembre 2026" */
export function formatLongDay(day: string): string {
  const date = parseDay(day);
  return date ? longDay.format(date) : day;
}

/** "30 oct. – 28 nov." */
export function formatDayRange(from: string, to: string): string {
  return `${formatDay(from)}${NBSP}–${NBSP}${formatDay(to)}`;
}
