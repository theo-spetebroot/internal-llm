import { describe, expect, it } from 'vitest';

import { buildUserStats, type CallDayRow, type TokenDayRow } from './user-stats.js';

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
    ...fields,
  };
}

function tokenRow(day: string, fields: Partial<TokenDayRow> = {}): TokenDayRow {
  return {
    day,
    promptEstimated: 0,
    promptReported: 0,
    completionEstimated: 0,
    completionReported: 0,
    ...fields,
  };
}

describe('buildUserStats', () => {
  it('returns zeros, no averages and one entry per day when there is no data', () => {
    const stats = buildUserStats({ query, days, calls: [], tokens: [] });

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
    const stats = buildUserStats({
      query,
      days,
      calls: [callRow('2026-11-23', { requests: 2 }), callRow('2026-11-27', { requests: 1 })],
      tokens: [tokenRow('2026-11-23', { promptEstimated: 10, completionReported: 5 })],
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
    const stats = buildUserStats({
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
      tokens: [],
    });

    expect(stats.averages.durationMs).toBe(250);
    expect(stats.averages.timeToFirstTokenMs).toBe(20);
  });

  it('computes the outcome counts and rates', () => {
    const stats = buildUserStats({
      query,
      days,
      calls: [
        callRow('2026-11-26', { requests: 2, completed: 1, error: 1 }),
        callRow('2026-11-27', { requests: 1, interrupted: 1 }),
      ],
      tokens: [],
    });

    expect(stats.outcomes).toEqual({
      completed: { count: 1, rate: 0.3333 },
      interrupted: { count: 1, rate: 0.3333 },
      error: { count: 1, rate: 0.3333 },
      timeout: { count: 0, rate: 0 },
    });
  });

  it('sums the tokens and tells the estimated ones from the reported ones', () => {
    const stats = buildUserStats({
      query,
      days,
      calls: [],
      tokens: [
        tokenRow('2026-11-26', { promptEstimated: 10, completionEstimated: 4 }),
        tokenRow('2026-11-27', {
          promptReported: 30,
          completionEstimated: 1,
          completionReported: 6,
        }),
      ],
    });

    expect(stats.tokens.prompt).toEqual({ total: 40, estimated: 10, reported: 30 });
    expect(stats.tokens.completion).toEqual({ total: 11, estimated: 5, reported: 6 });
  });

  it('ignores rows outside the period', () => {
    const stats = buildUserStats({
      query,
      days,
      calls: [callRow('2026-11-20', { requests: 5 }), callRow('2026-11-27', { requests: 1 })],
      tokens: [tokenRow('2026-11-28', { promptReported: 99 })],
    });

    expect(stats.requests).toBe(1);
    expect(stats.tokens.prompt.total).toBe(0);
  });
});
