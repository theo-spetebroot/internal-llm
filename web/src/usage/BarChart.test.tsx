import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeUserStats } from '@/test/stats-fixtures';

import { ActivityCharts } from './ActivityCharts';
import { formatCount, formatLongDay } from './usage-format';

/** 22 to 28 November 2026. */
const REQUESTS = [0, 3, 1, 12, 0, 5, 2];

function renderCharts() {
  const user = userEvent.setup();
  render(
    <ActivityCharts stats={makeUserStats({ days: 7, requestsPerDay: (i) => REQUESTS[i] ?? 0 })} />,
  );
  return { user };
}

const NBSP = String.fromCharCode(0xa0);
const NARROW_NBSP = String.fromCharCode(0x202f);

/** Testing Library reads the DOM text with its no-break spaces turned into plain spaces. */
const plain = (text: string) => text.replaceAll(NBSP, ' ').replaceAll(NARROW_NBSP, ' ');

const requestsChart = () => screen.getByRole('group', { name: /^Requêtes par jour/ });
const tokensChart = () => screen.getByRole('group', { name: /^Tokens par jour/ });
const tabStops = (chart: HTMLElement) => chart.querySelectorAll('[role="img"][tabindex="0"]');

describe('the bars', () => {
  it('announce each day with its date and its exact value', () => {
    renderCharts();
    const chart = within(requestsChart());

    expect(chart.getAllByRole('img')).toHaveLength(7);
    expect(chart.getByRole('img', { name: '25 nov. : 12 requêtes' })).toBeInTheDocument();
    expect(chart.getByRole('img', { name: '24 nov. : 1 requête' })).toBeInTheDocument();
    expect(chart.getByRole('img', { name: '22 nov. : 0 requête' })).toBeInTheDocument();
  });

  it('announce the prompt, the answer and the total of a day in the tokens chart', () => {
    renderCharts();

    expect(
      within(tokensChart()).getByRole('img', {
        name: `25 nov. : Prompt ${formatCount(1200)}, Réponse ${formatCount(480)}, total ${formatCount(1680)}`,
      }),
    ).toBeInTheDocument();
  });

  it('are summarised by their chart', () => {
    renderCharts();

    expect(requestsChart()).toHaveAccessibleName(
      'Requêtes par jour, du 22 nov. au 28 nov. : 23 au total, maximum 12 le 25 nov.',
    );
  });

  it('scale on the busiest day, and keep a quiet day at a thin line', () => {
    renderCharts();
    const chart = within(requestsChart());

    expect(chart.getByRole('img', { name: /25 nov\./ }).firstElementChild).toHaveStyle({
      height: '100%',
    });
    expect(chart.getByRole('img', { name: /23 nov\./ }).firstElementChild).toHaveStyle({
      height: '25%',
    });
    expect(chart.getByRole('img', { name: /22 nov\./ }).firstElementChild).toHaveClass('h-0.5');
  });
});

describe('the tooltip', () => {
  it('shows the date and the exact value on hover, and hides on leave', async () => {
    const { user } = renderCharts();
    const bar = within(requestsChart()).getByRole('img', { name: /25 nov\./ });
    expect(screen.queryByText(formatLongDay('2026-11-25'))).not.toBeInTheDocument();

    await user.hover(bar);
    expect(screen.getByText(formatLongDay('2026-11-25'))).toBeInTheDocument();
    expect(screen.getByText('12 requêtes')).toBeInTheDocument();

    await user.unhover(bar);
    expect(screen.queryByText(formatLongDay('2026-11-25'))).not.toBeInTheDocument();
  });

  it('lists the parts and the total of a stacked bar', async () => {
    const { user } = renderCharts();

    await user.hover(within(tokensChart()).getByRole('img', { name: /25 nov\./ }));

    expect(screen.getByText(plain(`Prompt : ${formatCount(1200)}`))).toBeInTheDocument();
    expect(screen.getByText(plain(`Réponse : ${formatCount(480)}`))).toBeInTheDocument();
    expect(screen.getByText(plain(`Total : ${formatCount(1680)}`))).toBeInTheDocument();
  });

  it('is shown by the keyboard focus too, and follows it', async () => {
    const { user } = renderCharts();

    await user.tab();
    expect(screen.getByText(formatLongDay('2026-11-28'))).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText(formatLongDay('2026-11-27'))).toBeInTheDocument();
    expect(screen.queryByText(formatLongDay('2026-11-28'))).not.toBeInTheDocument();

    await user.tab({ shift: true });
    expect(screen.queryByText(formatLongDay('2026-11-27'))).not.toBeInTheDocument();
  });

  it('is dismissed by Escape, and comes back on the next bar', async () => {
    const { user } = renderCharts();
    await user.tab();
    expect(screen.getByText(formatLongDay('2026-11-28'))).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText(formatLongDay('2026-11-28'))).not.toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText(formatLongDay('2026-11-27'))).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('gives each chart a single tab stop, on its last day', () => {
    renderCharts();

    for (const chart of [requestsChart(), tokensChart()]) {
      expect(tabStops(chart)).toHaveLength(1);
      expect(within(chart).getByRole('img', { name: /28 nov\./ })).toHaveAttribute('tabindex', '0');
    }
  });

  it('moves between the days with the arrows, Home and End, without going past the ends', async () => {
    const { user } = renderCharts();
    const chart = within(requestsChart());
    await user.tab();
    expect(chart.getByRole('img', { name: /28 nov\./ })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(chart.getByRole('img', { name: /28 nov\./ })).toHaveFocus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(chart.getByRole('img', { name: /26 nov\./ })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(chart.getByRole('img', { name: /22 nov\./ })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(chart.getByRole('img', { name: /22 nov\./ })).toHaveFocus();

    await user.keyboard('{End}');
    expect(chart.getByRole('img', { name: /28 nov\./ })).toHaveFocus();
  });

  it('remembers the day it left, as the tab stop', async () => {
    const { user } = renderCharts();
    const chart = within(requestsChart());
    await user.tab();
    await user.keyboard('{Home}');

    expect(chart.getByRole('img', { name: /22 nov\./ })).toHaveAttribute('tabindex', '0');
    expect(chart.getByRole('img', { name: /28 nov\./ })).toHaveAttribute('tabindex', '-1');
  });
});

describe('the data table', () => {
  it('lists the requests of each day', async () => {
    const { user } = renderCharts();
    const figure = requestsChart().closest('figure');
    if (!figure) throw new Error('No figure');

    await user.click(within(figure).getByText('Voir les données en tableau'));
    const table = within(figure).getByRole('table', { name: 'Requêtes par jour' });

    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByRole('row', { name: /25 nov\./ })).toHaveTextContent('12');
    expect(within(table).getByRole('columnheader', { name: 'Requêtes' })).toBeInTheDocument();
  });

  it('lists the prompt, the answer and the total of each day for the tokens', async () => {
    const { user } = renderCharts();
    const figure = tokensChart().closest('figure');
    if (!figure) throw new Error('No figure');

    await user.click(within(figure).getByText('Voir les données en tableau'));
    const table = within(figure).getByRole('table', { name: 'Tokens par jour' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Jour', 'Prompt', 'Réponse', 'Total']);
    const row = within(table).getByRole('row', { name: /25 nov\./ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([formatCount(1200), formatCount(480), formatCount(1680)]);
  });
});
