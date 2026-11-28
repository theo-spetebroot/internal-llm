import { describe, expect, it } from 'vitest';

import { parseView } from './usage-view';

describe('parseView', () => {
  it('gives an admin the instance view when it is asked for', () => {
    expect(parseView('instance', true)).toBe('instance');
  });

  it('never gives the instance view to anyone else', () => {
    expect(parseView('instance', false)).toBe('moi');
  });

  it.each([null, '', 'moi', 'admin', 'Instance'])('falls back to the own view for %j', (value) => {
    expect(parseView(value, true)).toBe('moi');
    expect(parseView(value, false)).toBe('moi');
  });
});
