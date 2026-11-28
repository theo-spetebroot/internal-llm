import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setViewport } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend, testUser } from '@/test/server';
import { makeAdminStats, makeRankingEntry, makeUserStats } from '@/test/stats-fixtures';
import { THEME_STORAGE_KEY } from '@/theme/theme';

const USERS = [
  makeRankingEntry({
    email: 'camille@exemple.fr',
    displayName: 'Camille Martin',
    requests: 612,
    promptTokens: 1_490_000,
    completionTokens: 520_000,
    failureRate: 0.031,
  }),
  // The signed-in user.
  makeRankingEntry({
    email: testUser.email,
    displayName: testUser.displayName,
    requests: 402,
    promptTokens: 980_000,
    completionTokens: 350_000,
    failureRate: 0.047,
  }),
  makeRankingEntry({
    email: 'leo@exemple.fr',
    displayName: 'Léo Bernard',
    requests: 24,
    promptTokens: 50_000,
    completionTokens: 20_000,
    failureRate: 0,
  }),
  makeRankingEntry({ email: 'hugo@exemple.fr', displayName: 'Hugo Petit' }),
];

const INSTANCE = makeAdminStats({ requestsPerDay: () => 35, users: USERS });
const OWN = makeUserStats({ requestsPerDay: () => 2 });

beforeEach(() => {
  backend.loggedIn = true;
  backend.stats.me = OWN;
});

/** The card of a key figure, found by its label. */
function figure(label: string): HTMLElement {
  const card = screen.getByText(label, { selector: 'dt' }).parentElement;
  if (!card) throw new Error(`No card for ${label}`);
  return card;
}

const findOwnFigures = () => screen.findByText('Requêtes', { selector: 'dt' });
const findInstanceFigures = () => screen.findByText('Utilisateurs actifs', { selector: 'dt' });

function asAdmin() {
  backend.role = 'ADMIN';
  backend.stats.admin = INSTANCE;
}

describe('for a user who is not an admin', () => {
  it('has no instance view', async () => {
    renderApp('/usage');
    await findOwnFigures();

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Instance' })).not.toBeInTheDocument();
  });

  it('ignores the instance view named by the address, and never asks for it', async () => {
    renderApp('/usage?vue=instance');
    await findOwnFigures();

    expect(screen.queryByText('Utilisateurs actifs', { selector: 'dt' })).not.toBeInTheDocument();
    expect(backend.adminStatsRequests).toHaveLength(0);
  });
});

describe('for an admin', () => {
  beforeEach(asAdmin);

  it('starts on their own figures, with a tab for the instance', async () => {
    renderApp('/usage');
    await findOwnFigures();

    expect(screen.getByRole('tablist', { name: 'Portée des chiffres' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mon usage' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Instance' })).toHaveAttribute('aria-selected', 'false');
    expect(backend.adminStatsRequests).toHaveLength(0);
  });

  it('opens the instance view from its tab, and keeps it in the address', async () => {
    const { user, router } = renderApp('/usage');
    await findOwnFigures();

    await user.click(screen.getByRole('tab', { name: 'Instance' }));
    await findInstanceFigures();

    expect(router.state.location.search).toBe('?vue=instance');
    expect(screen.getByRole('tab', { name: 'Instance' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Instance' })).toBeInTheDocument();
    const [request] = backend.adminStatsRequests;
    expect(request?.get('days')).toBe('30');
    expect(request?.get('tz')).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('can be opened directly from its address', async () => {
    renderApp('/usage?vue=instance&periode=7');

    await findInstanceFigures();
    expect(screen.getByRole('tab', { name: 'Instance' })).toHaveAttribute('aria-selected', 'true');
    expect(backend.adminStatsRequests[0]?.get('days')).toBe('7');
  });

  it('goes back to their own figures, and keeps the period', async () => {
    const { user, router } = renderApp('/usage?vue=instance&periode=90');
    await findInstanceFigures();

    await user.click(screen.getByRole('tab', { name: 'Mon usage' }));
    await findOwnFigures();

    expect(router.state.location.search).toBe('?periode=90');
  });

  it('follows the period in the instance view, and keeps the view', async () => {
    const { user, router } = renderApp('/usage?vue=instance');
    await findInstanceFigures();

    await user.click(screen.getByRole('radio', { name: '7 jours' }));
    await waitFor(() => {
      expect(backend.adminStatsRequests).toHaveLength(2);
    });

    expect(backend.adminStatsRequests[1]?.get('days')).toBe('7');
    expect(new URLSearchParams(router.state.location.search).get('vue')).toBe('instance');
    expect(new URLSearchParams(router.state.location.search).get('periode')).toBe('7');
  });
});

describe('the instance view', () => {
  beforeEach(asAdmin);

  it('shows the figures of everyone, and the active users out of all the accounts', async () => {
    renderApp('/usage?vue=instance');
    await findInstanceFigures();

    // 35 requests a day over 30 days.
    expect(figure('Requêtes')).toHaveTextContent('1 050');
    expect(figure('Utilisateurs actifs')).toHaveTextContent('3 sur 4');
    expect(screen.getByRole('group', { name: /^Requêtes par jour/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Issue des requêtes' })).toBeInTheDocument();
  });

  it('says when nobody called the model', async () => {
    backend.stats.admin = makeAdminStats({
      users: USERS.map((user) => ({ ...user, requests: 0 })),
    });
    renderApp('/usage?vue=instance');

    expect(
      await screen.findByRole('heading', { name: 'Rien à compter pour l’instant.' }),
    ).toBeInTheDocument();
  });

  it('says so and retries when the figures cannot be loaded', async () => {
    backend.stats.admin = 500;
    const { user } = renderApp('/usage?vue=instance');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les chiffres n’ont pas pu être chargés.',
    );
    backend.stats.admin = INSTANCE;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await findInstanceFigures()).toBeInTheDocument();
  });

  describe('when the server refuses it', () => {
    it('says the view is for admins, without offering to retry', async () => {
      backend.stats.admin = 403;
      renderApp('/usage?vue=instance');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cette vue est réservée aux administrateurs.',
      );
      expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
    });

    it('drops the instance view once the session shows the role was removed', async () => {
      // The role is taken away between the page load and the request.
      backend.stats.admin = () => {
        backend.role = 'USER';
        return 403;
      };
      renderApp('/usage?vue=instance');

      await waitFor(() => {
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      });
      expect(await findOwnFigures()).toBeInTheDocument();
    });
  });
});

describe('the ranking of the users', () => {
  beforeEach(asAdmin);

  it('is a table on a wide screen, in the order sent by the API', async () => {
    renderApp('/usage?vue=instance');
    const table = await screen.findByRole('table', { name: 'Classement des utilisateurs' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Utilisateur', 'Requêtes', 'Tokens prompt', 'Tokens réponse', 'Échecs']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Camille Martin');
    expect(rows[1]).toHaveTextContent('Théo Martin');
    expect(rows[2]).toHaveTextContent('Léo Bernard');
    expect(rows[3]).toHaveTextContent('Hugo Petit');
  });

  it('shows the email, the requests, the tokens and the failure rate of each account', async () => {
    renderApp('/usage?vue=instance');
    const table = await screen.findByRole('table', { name: 'Classement des utilisateurs' });

    const camille = within(table).getByRole('row', { name: /Camille Martin/ });
    expect(camille).toHaveTextContent('camille@exemple.fr');
    expect(camille).toHaveTextContent('612');
    expect(camille).toHaveTextContent('1,49 M');
    expect(camille).toHaveTextContent('520 k');
    expect(camille).toHaveTextContent('3,1 %');
    expect(within(table).getByRole('row', { name: /Théo Martin/ })).toHaveTextContent('4,7 %');
    expect(within(table).getByRole('row', { name: /Léo Bernard/ })).toHaveTextContent('0 %');
  });

  it('shows no failure rate for an account that made no request', async () => {
    renderApp('/usage?vue=instance');
    const table = await screen.findByRole('table', { name: 'Classement des utilisateurs' });

    const hugo = within(table).getByRole('row', { name: /Hugo Petit/ });
    expect(within(hugo).getAllByRole('cell').at(-1)).toHaveTextContent('—');
    expect(hugo).toHaveTextContent('0');
  });

  it('highlights the row of the signed-in user, and only that one', async () => {
    renderApp('/usage?vue=instance');
    const table = await screen.findByRole('table', { name: 'Classement des utilisateurs' });

    const own = within(table).getByRole('row', { name: /Théo Martin/ });
    expect(own).toHaveAttribute('aria-current', 'true');
    expect(within(own).getByText('Vous')).toBeInTheDocument();
    expect(within(table).getAllByText('Vous')).toHaveLength(1);
    for (const name of [/Camille Martin/, /Léo Bernard/, /Hugo Petit/]) {
      expect(within(table).getByRole('row', { name })).not.toHaveAttribute('aria-current');
    }
  });

  it('explains what a failure is', async () => {
    renderApp('/usage?vue=instance');

    expect(await screen.findByText(/Échecs : erreurs et timeouts/)).toBeInTheDocument();
  });

  describe('at phone width', () => {
    beforeEach(() => {
      setViewport('mobile');
    });

    it('becomes a list of cards', async () => {
      renderApp('/usage?vue=instance');
      const section = await screen.findByRole('region', { name: 'Par utilisateur' });

      expect(within(section).queryByRole('table')).not.toBeInTheDocument();
      const items = within(section).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(items[0]).toHaveTextContent('Camille Martin');
      expect(items[0]).toHaveTextContent('612 req.');
      expect(items[0]).toHaveTextContent('échecs 3,1 %');
      expect(items[3]).toHaveTextContent('échecs —');
    });

    it('still highlights the signed-in user', async () => {
      renderApp('/usage?vue=instance');
      const section = await screen.findByRole('region', { name: 'Par utilisateur' });

      const own = within(section).getAllByRole('listitem')[1];
      expect(own).toHaveAttribute('aria-current', 'true');
      expect(own).toHaveTextContent('Vous');
      expect(within(section).getAllByText('Vous')).toHaveLength(1);
    });

    it('keeps the tabs and the period selector', async () => {
      renderApp('/usage?vue=instance');
      await findInstanceFigures();

      expect(screen.getByRole('tab', { name: 'Instance' })).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Période' })).toBeInTheDocument();
    });
  });
});

describe('in the dark theme', () => {
  it('shows the same figures, and the same ranking', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    asAdmin();
    renderApp('/usage?vue=instance');

    await screen.findByRole('table', { name: 'Classement des utilisateurs' });
    expect(document.documentElement).toHaveClass('dark');
    expect(figure('Utilisateurs actifs')).toHaveTextContent('3 sur 4');
    expect(screen.getByRole('group', { name: /^Tokens par jour/ })).toBeInTheDocument();
  });
});
