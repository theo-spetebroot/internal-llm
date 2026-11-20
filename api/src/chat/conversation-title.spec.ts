import { describe, expect, it } from 'vitest';

import { AUTO_TITLE_MAX_LENGTH, titleFromMessage } from './conversation-title.js';

describe('titleFromMessage', () => {
  it('keeps a short message as is, with whitespace collapsed', () => {
    expect(titleFromMessage('  Comment   faire\nun gâteau ?  ')).toBe('Comment faire un gâteau ?');
  });

  it('cuts a long message on a word boundary and adds an ellipsis', () => {
    const title = titleFromMessage(
      'Peux-tu m’expliquer la différence entre un processus et un thread en détail ?',
    );
    expect(title).toBe('Peux-tu m’expliquer la différence entre un…');
    expect(title.length).toBeLessThanOrEqual(AUTO_TITLE_MAX_LENGTH);
  });

  it('cuts mid-word when there is no reasonable word boundary', () => {
    const title = titleFromMessage('x'.repeat(80));
    expect(title).toBe(`${'x'.repeat(AUTO_TITLE_MAX_LENGTH - 1)}…`);
  });
});
