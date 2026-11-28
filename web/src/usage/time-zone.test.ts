import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserTimeZone } from './time-zone';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResolvedTimeZone(timeZone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone,
  } as Intl.ResolvedDateTimeFormatOptions);
}

describe('browserTimeZone', () => {
  it("is the browser's IANA time zone", () => {
    mockResolvedTimeZone('Europe/Paris');

    expect(browserTimeZone()).toBe('Europe/Paris');
  });

  it('falls back to UTC when the browser does not tell', () => {
    mockResolvedTimeZone(undefined);
    expect(browserTimeZone()).toBe('UTC');

    mockResolvedTimeZone('');
    expect(browserTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when asking fails', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new RangeError('no time zone');
    });

    expect(browserTimeZone()).toBe('UTC');
  });
});
