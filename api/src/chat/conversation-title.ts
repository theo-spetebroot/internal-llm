export const AUTO_TITLE_MAX_LENGTH = 50;

/**
 * Title derived from the first message of a conversation: whitespace collapsed, cut on a
 * word boundary when possible, with an ellipsis when shortened.
 */
export function titleFromMessage(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= AUTO_TITLE_MAX_LENGTH) return text;

  const cut = text.slice(0, AUTO_TITLE_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only cut on a word boundary if it doesn't throw away too much of the text.
  const base = lastSpace >= AUTO_TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
