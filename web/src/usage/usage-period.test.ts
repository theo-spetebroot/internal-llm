import { describe, expect, it } from 'vitest';

import { DEFAULT_USAGE_PERIOD, parsePeriod } from './usage-period';

describe('parsePeriod', () => {
  it.each([
    ['7', 7],
    ['30', 30],
    ['90', 90],
  ])('reads %s as %i days', (value, days) => {
    expect(parsePeriod(value)).toBe(days);
  });

  it.each([null, '', '14', '0', '-7', 'abc', '7.5', '30 '])(
    'falls back to the default for %j',
    (value) => {
      expect(parsePeriod(value)).toBe(DEFAULT_USAGE_PERIOD);
    },
  );
});
