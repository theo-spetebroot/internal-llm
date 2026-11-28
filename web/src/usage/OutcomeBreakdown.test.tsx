import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OutcomeBreakdown } from './OutcomeBreakdown';

const outcomes = {
  completed: { count: 371, rate: 0.9 },
  interrupted: { count: 24, rate: 0.0583 },
  error: { count: 11, rate: 0.0267 },
  timeout: { count: 6, rate: 0.0146 },
};

/** The picture of the breakdown: its segments are not read by assistive technologies. */
function barSegments(): Element[] {
  const section = screen.getByRole('region', { name: 'Issue des requêtes' });
  const bar = section.querySelector('[aria-hidden="true"]');
  return bar ? [...bar.children] : [];
}

describe('OutcomeBreakdown', () => {
  it('writes the count and the share of each outcome', () => {
    render(<OutcomeBreakdown outcomes={outcomes} />);
    const list = within(screen.getByRole('list'));

    expect(list.getAllByRole('listitem')).toHaveLength(4);
    expect(list.getByText('Terminées').closest('li')).toHaveTextContent('371');
    expect(list.getByText('Terminées').closest('li')).toHaveTextContent('90 %');
    expect(list.getByText('Interrompues').closest('li')).toHaveTextContent('24');
    expect(list.getByText('Interrompues').closest('li')).toHaveTextContent('5,8 %');
    expect(list.getByText('Erreurs').closest('li')).toHaveTextContent('11');
    expect(list.getByText('Erreurs').closest('li')).toHaveTextContent('2,7 %');
    expect(list.getByText('Timeouts').closest('li')).toHaveTextContent('6');
    expect(list.getByText('Timeouts').closest('li')).toHaveTextContent('1,5 %');
  });

  it('draws a segment per outcome, in proportion to its count', () => {
    render(<OutcomeBreakdown outcomes={outcomes} />);

    const segments = barSegments();
    expect(segments).toHaveLength(4);
    expect(segments.map((segment) => (segment as HTMLElement).style.flex)).toEqual([
      '371 1 0%',
      '24 1 0%',
      '11 1 0%',
      '6 1 0%',
    ]);
  });

  it('leaves out of the picture an outcome that did not happen, but keeps it in the list', () => {
    render(
      <OutcomeBreakdown
        outcomes={{
          completed: { count: 10, rate: 1 },
          interrupted: { count: 0, rate: 0 },
          error: { count: 0, rate: 0 },
          timeout: { count: 0, rate: 0 },
        }}
      />,
    );

    expect(barSegments()).toHaveLength(1);
    expect(screen.getByText('Erreurs').closest('li')).toHaveTextContent('0 %');
  });

  it('tells the outcomes apart by more than their colour', () => {
    render(<OutcomeBreakdown outcomes={outcomes} />);

    const swatches = [...screen.getByRole('list').querySelectorAll('li > span:first-child')];
    const classes = swatches.map((swatch) => swatch.className);
    // Four different fills, the timeout also being outlined.
    expect(new Set(classes).size).toBe(4);
    expect(classes[3]).toContain('border');
  });
});
