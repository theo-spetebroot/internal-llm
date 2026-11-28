import { describe, expect, it } from 'vitest';

import { buildAdminStats, type UserCallsRow } from './admin-stats.js';
import type { CallDayRow } from './usage-stats.js';

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

function userRow(email: string, fields: Partial<UserCallsRow> = {}): UserCallsRow {
  return {
    email,
    displayName: email.split('@')[0] ?? email,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    failed: 0,
    ...fields,
  };
}

function build(users: UserCallsRow[], calls: CallDayRow[] = []) {
  return buildAdminStats({ query, days, calls, users });
}

describe('buildAdminStats', () => {
  it('has the figures of the per-user stats over the calls it is given', () => {
    const stats = build(
      [userRow('a@example.com', { requests: 3 })],
      [
        {
          day: '2026-11-27',
          requests: 3,
          durationSum: 300,
          firstTokenCount: 3,
          firstTokenSum: 30,
          completed: 3,
          interrupted: 0,
          error: 0,
          timeout: 0,
          promptEstimated: 12,
          promptReported: 0,
          completionEstimated: 0,
          completionReported: 6,
        },
      ],
    );

    expect(stats.period).toMatchObject({ days: 7, from: '2026-11-21', to: '2026-11-27' });
    expect(stats.requests).toBe(3);
    expect(stats.tokens.prompt.total).toBe(12);
    expect(stats.averages.durationMs).toBe(100);
    expect(stats.daily).toHaveLength(7);
  });

  it('copies the identity and the figures of each account', () => {
    const stats = build([
      userRow('ada@example.com', {
        displayName: 'Ada',
        requests: 4,
        promptTokens: 120,
        completionTokens: 45,
      }),
    ]);

    expect(stats.users).toEqual([
      {
        email: 'ada@example.com',
        displayName: 'Ada',
        requests: 4,
        promptTokens: 120,
        completionTokens: 45,
        failureRate: 0,
      },
    ]);
  });

  it('ranks the accounts by requests, then by email', () => {
    const stats = build([
      userRow('d@example.com', { requests: 1 }),
      userRow('b@example.com', { requests: 5 }),
      userRow('c@example.com', { requests: 5 }),
      userRow('a@example.com', { requests: 0 }),
    ]);

    expect(stats.users.map((user) => user.email)).toEqual([
      'b@example.com',
      'c@example.com',
      'd@example.com',
      'a@example.com',
    ]);
  });

  it('does not reorder the rows it received', () => {
    const rows = [
      userRow('b@example.com', { requests: 1 }),
      userRow('a@example.com', { requests: 2 }),
    ];

    build(rows);

    expect(rows.map((row) => row.email)).toEqual(['b@example.com', 'a@example.com']);
  });

  it('counts a failure rate from the failed calls, rounded to four decimals', () => {
    const stats = build([
      userRow('a@example.com', { requests: 3, failed: 1 }),
      userRow('b@example.com', { requests: 4, failed: 4 }),
    ]);

    expect(stats.users.find((user) => user.email === 'a@example.com')?.failureRate).toBe(0.3333);
    expect(stats.users.find((user) => user.email === 'b@example.com')?.failureRate).toBe(1);
  });

  it('has a failure rate of 0 for an account without any request', () => {
    const stats = build([userRow('a@example.com')]);

    expect(stats.users[0]?.failureRate).toBe(0);
  });

  it('counts the accounts that made at least one request as active', () => {
    const stats = build([
      userRow('a@example.com', { requests: 2 }),
      userRow('b@example.com', { requests: 1, failed: 1 }),
      userRow('c@example.com'),
    ]);

    expect(stats.activeUsers).toBe(2);
    expect(stats.users).toHaveLength(3);
  });

  it('has no active user and no account when the instance is empty', () => {
    const stats = build([]);

    expect(stats.activeUsers).toBe(0);
    expect(stats.users).toEqual([]);
    expect(stats.requests).toBe(0);
  });
});
