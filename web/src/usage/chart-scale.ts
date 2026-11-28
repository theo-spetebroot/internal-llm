/**
 * Heights of the bars of a chart, in percent of its height: the tallest bar is 100, the others
 * keep their proportion, and a bar of 0 stays at 0. All at 0 when nothing is above 0.
 */
export function barHeights(totals: readonly number[]): number[] {
  const max = Math.max(0, ...totals);
  return totals.map((total) => (max === 0 ? 0 : (Math.max(0, total) / max) * 100));
}
