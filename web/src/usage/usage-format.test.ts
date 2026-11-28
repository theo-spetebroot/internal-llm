import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatDay,
  formatDayRange,
  formatDuration,
  formatLongDay,
  formatPercent,
  formatPerDay,
  formatTokens,
  NO_FIGURE,
} from './usage-format';

describe('formatCount', () => {
  it('writes the exact count with thousands separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(412)).toBe('412');
    expect(formatCount(1_234_567)).toBe('1 234 567');
  });
});

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [950, '950'],
    [1_000, '1 k'],
    [1_234, '1,23 k'],
    [12_400, '12,4 k'],
    [124_000, '124 k'],
    [999_999, '1 M'],
    [1_280_000, '1,28 M'],
    [12_500_000, '12,5 M'],
  ])('writes %i as %j', (count, expected) => {
    expect(formatTokens(count)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [null, NO_FIGURE],
    [0, '0 ms'],
    [620, '620 ms'],
    [1_000, '1 s'],
    [3_400, '3,4 s'],
    [3_449, '3,4 s'],
    [10_000, '10 s'],
    [59_960, '1 min'],
    [65_000, '1 min 5 s'],
    [120_000, '2 min'],
  ])('writes %j as %j', (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it.each([
    [0, '0 %'],
    [0.058, '5,8 %'],
    [0.3333, '33,3 %'],
    [0.9, '90 %'],
    [1, '100 %'],
  ])('writes %d as %j', (rate, expected) => {
    expect(formatPercent(rate)).toBe(expected);
  });

  it('never shows 0 % for a share that is not zero', () => {
    expect(formatPercent(0.0001)).toBe('< 0,1 %');
  });
});

describe('formatPerDay', () => {
  it('rounds above ten a day and keeps one decimal below', () => {
    expect(formatPerDay(412, 30)).toBe('≈ 14 par jour');
    expect(formatPerDay(3, 30)).toBe('≈ 0,1 par jour');
    expect(formatPerDay(21, 7)).toBe('≈ 3 par jour');
  });
});

describe('days', () => {
  it('writes a short day', () => {
    expect(formatDay('2026-11-28')).toBe('28 nov.');
    expect(formatDay('2026-10-30')).toBe('30 oct.');
    expect(formatDay('2026-01-01')).toBe('1 janv.');
  });

  it('writes a long day, with its weekday and year', () => {
    expect(formatLongDay('2026-11-28')).toBe('samedi 28 novembre 2026');
  });

  it('keeps what is not a day as it is', () => {
    expect(formatDay('hier')).toBe('hier');
    expect(formatLongDay('hier')).toBe('hier');
  });

  it('writes a range', () => {
    expect(formatDayRange('2026-10-30', '2026-11-28')).toBe('30 oct. – 28 nov.');
  });
});
