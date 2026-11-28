import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { backend } from '@/test/server';
import { makeUserStats } from '@/test/stats-fixtures';

beforeEach(() => {
  backend.loggedIn = true;
});

/** Waits for the key figures to be on screen. */
function findFigures(): Promise<HTMLElement> {
  return screen.findByText('Requêtes', { selector: 'dt' });
}

/** The card of a key figure, found by its label. */
function figure(label: string): HTMLElement {
  const card = screen.getByText(label, { selector: 'dt' }).parentElement;
  if (!card) throw new Error(`No card for ${label}`);
  return card;
}

const BUSY_FIGURES = makeUserStats({
  // Totals set as a whole: the daily series is not what these tests look at.
  requests: 412,
  tokens: {
    prompt: { total: 940_000, estimated: 940_000, reported: 0 },
    completion: { total: 340_000, estimated: 340_000, reported: 0 },
  },
  averages: { durationMs: 3_400, timeToFirstTokenMs: 620 },
  requestsPerDay: () => 1,
});

describe('the figures of the signed-in user', () => {
  it('shows the requests, the tokens and the two average durations', async () => {
    backend.stats.me = BUSY_FIGURES;
    renderApp('/usage');

    await findFigures();
    expect(figure('Requêtes')).toHaveTextContent('412');
    expect(figure('Requêtes')).toHaveTextContent('≈ 14 par jour');
    expect(figure('Tokens')).toHaveTextContent('1,28 M');
    expect(figure('Tokens')).toHaveTextContent('940 k prompt · 340 k réponse');
    expect(figure('Durée moyenne')).toHaveTextContent('3,4 s');
    expect(figure('Premier token')).toHaveTextContent('620 ms');
  });

  it('tells the period and the time zone it covers', async () => {
    backend.stats.me = BUSY_FIGURES;
    renderApp('/usage');

    expect(await screen.findByText(/30 oct\.\s+–\s+28 nov\. · Europe\/Paris/)).toBeInTheDocument();
  });

  it('asks for the selected period in the time zone of the browser', async () => {
    const { user } = renderApp('/usage');
    await screen.findByRole('radiogroup', { name: 'Période' });
    await waitFor(() => {
      expect(backend.statsRequests).toHaveLength(1);
    });

    await user.click(screen.getByRole('radio', { name: '7 jours' }));
    await waitFor(() => {
      expect(backend.statsRequests).toHaveLength(2);
    });

    const [first, second] = backend.statsRequests;
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(first?.get('days')).toBe('30');
    expect(first?.get('tz')).toBe(timeZone);
    expect(second?.get('days')).toBe('7');
    expect(second?.get('tz')).toBe(timeZone);
  });

  it('shows no figure for an average that has no data', async () => {
    backend.stats.me = makeUserStats({
      requestsPerDay: () => 1,
      averages: { durationMs: null, timeToFirstTokenMs: null },
    });
    renderApp('/usage');

    await findFigures();
    expect(figure('Durée moyenne')).toHaveTextContent('—');
    expect(figure('Premier token')).toHaveTextContent('—');
  });

  describe('the origin of the token counts', () => {
    it('flags counts that are all estimated', async () => {
      backend.stats.me = BUSY_FIGURES;
      renderApp('/usage');

      await findFigures();
      expect(within(figure('Tokens')).getByText('estimés')).toBeInTheDocument();
    });

    it('flags counts that are partly estimated', async () => {
      backend.stats.me = makeUserStats({
        requestsPerDay: () => 1,
        tokens: {
          prompt: { total: 150, estimated: 50, reported: 100 },
          completion: { total: 40, estimated: 40, reported: 0 },
        },
      });
      renderApp('/usage');

      await findFigures();
      expect(within(figure('Tokens')).getByText('en partie estimés')).toBeInTheDocument();
    });

    it('does not flag counts reported by the model server', async () => {
      backend.stats.me = makeUserStats({
        requestsPerDay: () => 1,
        tokens: {
          prompt: { total: 150, estimated: 0, reported: 150 },
          completion: { total: 40, estimated: 0, reported: 40 },
        },
      });
      renderApp('/usage');

      await findFigures();
      expect(within(figure('Tokens')).queryByText(/estimés/)).not.toBeInTheDocument();
    });
  });

  it('keeps the previous figures, dimmed, while another period loads', async () => {
    backend.stats.me = (query) =>
      makeUserStats({
        days: Number(query.get('days')) as 7 | 30 | 90,
        requestsPerDay: () => 5,
      });
    const { user } = renderApp('/usage');
    await findFigures();
    const requests = () => within(figure('Requêtes'));
    expect(requests().getByText('150')).toBeInTheDocument();

    const gate = Promise.withResolvers<undefined>();
    backend.stats.hold = gate.promise;
    await user.click(screen.getByRole('radio', { name: '7 jours' }));

    // No flash back to the loading state: the 30-day figures wait for the 7-day ones.
    expect(requests().getByText('150')).toBeInTheDocument();
    expect(figure('Requêtes').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Chargement des chiffres…')).not.toBeInTheDocument();

    gate.resolve(undefined);
    expect(await requests().findByText('35')).toBeInTheDocument();
    expect(figure('Requêtes').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  });
});

describe('while the figures load', () => {
  it('shows a loading state, then the figures', async () => {
    const gate = Promise.withResolvers<undefined>();
    backend.stats.hold = gate.promise;
    backend.stats.me = BUSY_FIGURES;
    renderApp('/usage');

    expect(await screen.findByText('Chargement des chiffres…')).toHaveAttribute('role', 'status');
    expect(screen.queryByText('Requêtes', { selector: 'dt' })).not.toBeInTheDocument();
    // The period can already be changed.
    expect(screen.getByRole('radiogroup', { name: 'Période' })).toBeInTheDocument();

    gate.resolve(undefined);
    expect(await findFigures()).toBeInTheDocument();
    expect(screen.queryByText('Chargement des chiffres…')).not.toBeInTheDocument();
  });
});

describe('when there is nothing to count', () => {
  it('says so, and offers to start a conversation', async () => {
    const { router, user } = renderApp('/usage');

    expect(
      await screen.findByRole('heading', { name: 'Rien à compter pour l’instant.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Aucune requête sur les 30 derniers jours/)).toBeInTheDocument();
    expect(screen.queryByText('Requêtes', { selector: 'dt' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Démarrer une conversation' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('offers a longer period, then stops offering it at 90 days', async () => {
    const { router, user } = renderApp('/usage?periode=7');

    expect(await screen.findByText(/Aucune requête sur les 7 derniers jours/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir 90 jours' }));

    expect(router.state.location.search).toBe('?periode=90');
    expect(await screen.findByText(/Aucune requête sur les 90 derniers jours/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir 90 jours' })).not.toBeInTheDocument();
  });
});

describe('when the figures cannot be loaded', () => {
  it('says so and retries on demand', async () => {
    backend.stats.me = 500;
    const { user } = renderApp('/usage');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les chiffres n’ont pas pu être chargés.',
    );
    // The period can still be changed.
    expect(screen.getByRole('radiogroup', { name: 'Période' })).toBeInTheDocument();

    backend.stats.me = BUSY_FIGURES;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await findFigures()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the outcome of the requests', () => {
  it('is broken down under the charts', async () => {
    backend.stats.me = makeUserStats({
      requestsPerDay: () => 10,
      outcomes: {
        completed: { count: 250, rate: 0.8333 },
        interrupted: { count: 30, rate: 0.1 },
        error: { count: 15, rate: 0.05 },
        timeout: { count: 5, rate: 0.0167 },
      },
    });
    renderApp('/usage');

    const section = await screen.findByRole('region', { name: 'Issue des requêtes' });
    expect(within(section).getByText('Terminées').closest('li')).toHaveTextContent('83,3 %');
    expect(within(section).getByText('Interrompues').closest('li')).toHaveTextContent('10 %');
    expect(within(section).getByText('Erreurs').closest('li')).toHaveTextContent('5 %');
    expect(within(section).getByText('Timeouts').closest('li')).toHaveTextContent('1,7 %');
  });
});

describe('the charts of the period', () => {
  it('draw one bar per day, and follow the period', async () => {
    backend.stats.me = (query) =>
      makeUserStats({
        days: Number(query.get('days')) as 7 | 30 | 90,
        requestsPerDay: (index) => index % 4,
      });
    const { user } = renderApp('/usage');

    const requests = await screen.findByRole('group', { name: /^Requêtes par jour/ });
    expect(within(requests).getAllByRole('img')).toHaveLength(30);
    expect(
      within(screen.getByRole('group', { name: /^Tokens par jour/ })).getAllByRole('img'),
    ).toHaveLength(30);

    await user.click(screen.getByRole('radio', { name: '7 jours' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('group', { name: /^Requêtes par jour/ })).getAllByRole('img'),
      ).toHaveLength(7);
    });
  });

  it('are not drawn when there is nothing to count', async () => {
    renderApp('/usage');

    await screen.findByRole('heading', { name: 'Rien à compter pour l’instant.' });
    expect(screen.queryByRole('group', { name: /par jour/ })).not.toBeInTheDocument();
  });
});
