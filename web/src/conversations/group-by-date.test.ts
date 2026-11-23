import { describe, expect, it } from 'vitest';

import type { Conversation } from './conversations-api';
import { groupByDate } from './group-by-date';

function conversation(id: string, lastMessageAt: Date): Conversation {
  const iso = lastMessageAt.toISOString();
  return { id, title: id, createdAt: iso, updatedAt: iso, lastMessageAt: iso };
}

// Thursday 19 November 2026, 15:00 local time.
const now = new Date(2026, 10, 19, 15, 0);

describe('groupByDate', () => {
  it('splits conversations into today, this week and older, keeping their order', () => {
    const groups = groupByDate(
      [
        conversation('today-late', new Date(2026, 10, 19, 14, 0)),
        conversation('today-early', new Date(2026, 10, 19, 0, 0)),
        conversation('monday', new Date(2026, 10, 16, 0, 0)),
        conversation('last-sunday', new Date(2026, 10, 15, 23, 59)),
        conversation('last-year', new Date(2025, 0, 1)),
      ],
      now,
    );

    expect(groups.map((group) => [group.label, group.conversations.map((c) => c.id)])).toEqual([
      ['Aujourd’hui', ['today-late', 'today-early']],
      ['Cette semaine', ['monday']],
      ['Plus ancien', ['last-sunday', 'last-year']],
    ]);
  });

  it('treats Sunday as the end of the week', () => {
    const sunday = new Date(2026, 10, 22, 12, 0);
    const groups = groupByDate([conversation('monday', new Date(2026, 10, 16, 9, 0))], sunday);

    expect(groups.map((group) => group.label)).toEqual(['Cette semaine']);
  });

  it('leaves empty groups out', () => {
    expect(groupByDate([], now)).toEqual([]);
  });
});
