import type { Conversation } from './conversations-api';

export interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday 00:00 of the week containing `date` (weeks start on Monday in French). */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const daysSinceMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - daysSinceMonday);
  return day;
}

/**
 * Splits conversations (already sorted, most recent first) into "Aujourd'hui", "Cette semaine"
 * and "Plus ancien" by their last activity, in local time. Empty groups are left out.
 */
export function groupByDate(conversations: Conversation[], now = new Date()): ConversationGroup[] {
  const today = startOfDay(now).getTime();
  const thisWeek = startOfWeek(now).getTime();

  const groups: ConversationGroup[] = [
    { label: 'Aujourd’hui', conversations: [] },
    { label: 'Cette semaine', conversations: [] },
    { label: 'Plus ancien', conversations: [] },
  ];
  const [todayGroup, weekGroup, olderGroup] = groups as [
    ConversationGroup,
    ConversationGroup,
    ConversationGroup,
  ];

  for (const conversation of conversations) {
    const time = new Date(conversation.lastMessageAt).getTime();
    if (time >= today) todayGroup.conversations.push(conversation);
    else if (time >= thisWeek) weekGroup.conversations.push(conversation);
    else olderGroup.conversations.push(conversation);
  }

  return groups.filter((group) => group.conversations.length > 0);
}
