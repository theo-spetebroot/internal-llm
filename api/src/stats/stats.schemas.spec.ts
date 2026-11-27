import { describe, expect, it } from 'vitest';

import { statsQuerySchema } from './stats.schemas.js';

describe('statsQuerySchema', () => {
  it('defaults to 30 days in UTC', () => {
    expect(statsQuerySchema.parse({})).toEqual({ days: 30, tz: 'UTC' });
  });

  it.each(['7', '30', '90'])('accepts days=%s, sent as a query string', (days) => {
    expect(statsQuerySchema.parse({ days }).days).toBe(Number(days));
  });

  it.each(['0', '1', '8', '365', '-7', '7.5', 'abc', '', ' ', ['7', '30']])(
    'refuses days=%j',
    (days) => {
      expect(statsQuerySchema.safeParse({ days }).success).toBe(false);
    },
  );

  it('accepts an IANA time zone', () => {
    expect(statsQuerySchema.parse({ tz: 'Europe/Paris' }).tz).toBe('Europe/Paris');
  });

  it.each(['Nowhere/Land', '+01:00', 'CET', '', "Europe/Paris'; --"])('refuses tz=%j', (tz) => {
    expect(statsQuerySchema.safeParse({ tz }).success).toBe(false);
  });

  it('ignores unknown parameters', () => {
    expect(statsQuerySchema.parse({ days: '7', other: 'x' })).toEqual({ days: 7, tz: 'UTC' });
  });
});
