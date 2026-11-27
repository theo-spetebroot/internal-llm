import { describe, expect, it } from 'vitest';

import { CHARS_PER_TOKEN, estimateTokens } from './token-estimator.js';

describe('estimateTokens', () => {
  it('counts nothing for an empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('counts about one token per four characters', () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('rounds up, so that any text costs at least one token', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(401))).toBe(101);
  });

  it('grows with the length of the text', () => {
    expect(estimateTokens('hello world, this is a longer sentence')).toBeGreaterThan(
      estimateTokens('hello world'),
    );
  });
});
