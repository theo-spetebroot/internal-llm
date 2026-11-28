import { describe, expect, it } from 'vitest';

import { barHeights } from './chart-scale';

describe('barHeights', () => {
  it('makes the tallest bar 100 and keeps the proportions of the others', () => {
    expect(barHeights([5, 10, 2.5])).toEqual([50, 100, 25]);
  });

  it('keeps a day without activity at 0', () => {
    expect(barHeights([0, 4, 0])).toEqual([0, 100, 0]);
  });

  it('is all 0 when nothing happened', () => {
    expect(barHeights([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('has no bar for no day', () => {
    expect(barHeights([])).toEqual([]);
  });

  it('never goes below 0', () => {
    expect(barHeights([-3, 6])).toEqual([0, 100]);
  });
});
