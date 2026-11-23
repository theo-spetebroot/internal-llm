const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "14:32" for today, "19 nov., 14:32" otherwise (local time). */
export function formatMessageTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return (sameDay ? timeFormat : dateTimeFormat).format(date);
}
