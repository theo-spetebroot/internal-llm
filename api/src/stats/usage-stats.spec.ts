import { describe, expect, it } from 'vitest';

import { buildUsageStats, type CallDayRow, rate } from './usage-stats.js';

const query = { days: 7 as const, tz: 'UTC' };
const days = [
  '2026-11-21',
  '2026-11-22',
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
  '2026-11-26',
  '2026-11-27',
];

function callRow(day: string, fields: Partial<CallDayRow> = {}): CallDayRow {
  return {
    day,
    requests: 0,
    durationSum: 0,
    firstTokenCount: 0,
    firstTokenSum: 0,
    completed: 0,
    interrupted: 0,
    error: 0,
    timeout: 0,
    promptEstimated: 0,
    promptReported: 0,
    completionEstimated: 0,
    completionReported: 0,
    ...fields,
  };
}

describe('buildUsageStats', () => {
  it('returns zeros, no averages and one entry per day when there is no data', () => {
    const stats = buildUsageStats({ query, days, calls: [] });

    expect(stats.period).toEqual({
      days: 7,
      timeZone: 'UTC',
      from: '2026-11-21',
      to: '2026-11-27',
    });
    expect(stats.requests).toBe(0);
    expect(stats.averages).toEqual({ durationMs: null, timeToFirstTokenMs: null });
    expect(stats.tokens.prompt).toEqual({ total: 0, estimated: 0, reported: 0 });
    expect(stats.outcomes.completed).toEqual({ count: 0, rate: 0 });
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.every((point) => point.requests === 0 && point.promptTokens === 0)).toBe(
      true,
    );
  });

  it('fills the days without activity with zeros, in order', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [
        callRow('2026-11-23', { requests: 2, promptEstimated: 10, completionReported: 5 }),
        callRow('2026-11-27', { requests: 1 }),
      ],
    });

    expect(stats.daily.map((point) => [point.date, point.requests])).toEqual([
      ['2026-11-21', 0],
      ['2026-11-22', 0],
      ['2026-11-23', 2],
      ['2026-11-24', 0],
      ['2026-11-25', 0],
      ['2026-11-26', 0],
      ['2026-11-27', 1],
    ]);
    expect(stats.daily[2]).toMatchObject({ promptTokens: 10, completionTokens: 5 });
  });

  it('weights the averages by the number of calls, not by the number of days', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [
        callRow('2026-11-26', {
          requests: 1,
          durationSum: 100,
          firstTokenCount: 1,
          firstTokenSum: 10,
        }),
        // Three calls, one of them without a first token.
        callRow('2026-11-27', {
          requests: 3,
          durationSum: 900,
          firstTokenCount: 2,
          firstTokenSum: 50,
        }),
      ],
    });

    expect(stats.averages.durationMs).toBe(250);
    expect(stats.averages.timeToFirstTokenMs).toBe(20);
  });

  it('computes the outcome counts and rates', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [
        callRow('2026-11-26', { requests: 2, completed: 1, error: 1 }),
        callRow('2026-11-27', { requests: 1, interrupted: 1 }),
      ],
    });

    expect(stats.outcomes).toEqual({
      completed: { count: 1, rate: 0.3333 },
      interrupted: { count: 1, rate: 0.3333 },
      error: { count: 1, rate: 0.3333 },
      timeout: { count: 0, rate: 0 },
    });
  });

  it('sums the tokens and tells the estimated ones from the reported ones', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [
        callRow('2026-11-26', { requests: 1, promptEstimated: 10, completionEstimated: 4 }),
        callRow('2026-11-27', {
          requests: 2,
          promptReported: 30,
          completionEstimated: 1,
          completionReported: 6,
        }),
      ],
    });

    expect(stats.tokens.prompt).toEqual({ total: 40, estimated: 10, reported: 30 });
    expect(stats.tokens.completion).toEqual({ total: 11, estimated: 5, reported: 6 });
  });

  it('counts a call without token figures as a request that adds no token', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [callRow('2026-11-27', { requests: 3, completed: 3, promptEstimated: 12 })],
    });

    expect(stats.requests).toBe(3);
    expect(stats.tokens.prompt.total).toBe(12);
    expect(stats.tokens.completion.total).toBe(0);
  });

  it('ignores rows outside the period', () => {
    const stats = buildUsageStats({
      query,
      days,
      calls: [
        callRow('2026-11-20', { requests: 5, promptReported: 99 }),
        callRow('2026-11-27', { requests: 1 }),
        callRow('2026-11-28', { requests: 1, promptReported: 99 }),
      ],
    });

    expect(stats.requests).toBe(1);
    expect(stats.tokens.prompt.total).toBe(0);
  });
});

describe('rate', () => {
  it('is the share of the total, rounded to four decimals', () => {
    expect(rate(1, 3)).toBe(0.3333);
    expect(rate(2, 3)).toBe(0.6667);
    expect(rate(1, 2)).toBe(0.5);
    expect(rate(4, 4)).toBe(1);
  });

  it('is 0 when there is nothing to count', () => {
    expect(rate(0, 0)).toBe(0);
  });
});
