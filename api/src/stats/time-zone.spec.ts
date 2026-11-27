import { describe, expect, it } from 'vitest';

import { addDays, isValidTimeZone, lastDays, localDate } from './time-zone.js';

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Europe/Paris', 'America/Argentina/Buenos_Aires', 'Asia/Kolkata', 'Etc/GMT+3'])(
    'accepts %s',
    (name) => {
      expect(isValidTimeZone(name)).toBe(true);
    },
  );

  it.each([
    '',
    'Paris',
    'Mars/Olympus_Mons',
    'Europe/Paris; DROP TABLE users',
    '+01:00',
    'CET',
    'utc',
    'Europe/',
    '../etc/passwd',
  ])('refuses %j', (name) => {
    expect(isValidTimeZone(name)).toBe(false);
  });
});

describe('localDate', () => {
  it('is the UTC day in UTC', () => {
    expect(localDate(new Date('2026-11-27T23:30:00Z'), 'UTC')).toBe('2026-11-27');
  });

  it('moves to the next day for a zone ahead of UTC', () => {
    // Paris is UTC+1 in November.
    expect(localDate(new Date('2026-11-27T23:30:00Z'), 'Europe/Paris')).toBe('2026-11-28');
  });

  it('moves to the previous day for a zone behind UTC', () => {
    expect(localDate(new Date('2026-11-27T02:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-26');
  });

  it('follows daylight saving time', () => {
    // Paris is UTC+2 in July: 22:30 UTC is already the next day, 21:30 is not.
    expect(localDate(new Date('2026-07-10T22:30:00Z'), 'Europe/Paris')).toBe('2026-07-11');
    expect(localDate(new Date('2026-07-10T21:30:00Z'), 'Europe/Paris')).toBe('2026-07-10');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries, in both directions', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('is not affected by daylight saving changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });
});

describe('lastDays', () => {
  it('lists consecutive days, oldest first, ending on the given day', () => {
    expect(lastDays('2026-11-27', 3)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27']);
  });

  it('has exactly one entry per day', () => {
    const days = lastDays('2026-11-27', 90);
    expect(days).toHaveLength(90);
    expect(new Set(days).size).toBe(90);
    expect(days.at(-1)).toBe('2026-11-27');
  });
});
