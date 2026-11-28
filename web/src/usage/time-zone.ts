/**
 * The browser's IANA time zone (e.g. "Europe/Paris"), in which the API cuts the days. Falls
 * back to UTC, the API's default, when the browser does not tell.
 */
export function browserTimeZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
