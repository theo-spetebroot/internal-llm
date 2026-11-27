/** `UTC`, or a region and a place (`Europe/Paris`, `America/Argentina/Buenos_Aires`, `Etc/GMT+3`). */
const IANA_NAME = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;

/**
 * True for an IANA time zone name. Offsets (`+01:00`) and abbreviations (`CET`) are refused:
 * they do not follow daylight saving time, so they would not give the user's real days.
 */
export function isValidTimeZone(value: string): boolean {
  if (!IANA_NAME.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Calendar day (`YYYY-MM-DD`) of an instant, as seen in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Moves a `YYYY-MM-DD` calendar day by `days` (negative to go back). Time zone free. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** The `count` consecutive days ending on `lastDay` (included), oldest first. */
export function lastDays(lastDay: string, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => addDays(lastDay, index + 1 - count));
}
