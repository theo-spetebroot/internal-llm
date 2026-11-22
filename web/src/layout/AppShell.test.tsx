import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setViewport } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend, testUser } from '@/test/server';

import { SIDEBAR_COLLAPSED_STORAGE_KEY } from './layout.constants';

beforeEach(() => {
  backend.loggedIn = true;
});

describe('app shell on desktop', () => {
  it('docks the sidebar with the account and the theme selector', async () => {
    renderApp('/');

    const sidebar = await screen.findByRole('complementary');
    expect(within(sidebar).getByText(testUser.displayName)).toBeInTheDocument();
    expect(within(sidebar).getByRole('radiogroup', { name: 'Thème' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir la navigation' })).not.toBeInTheDocument();
  });

  it('collapses and expands the sidebar, and remembers it', async () => {
    const { user, unmount } = renderApp('/');
    await screen.findByRole('complementary');

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true');

    unmount();
    const second = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await second.user.click(screen.getByRole('button', { name: 'Déplier la barre latérale' }));

    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('false');
  });
});

describe('app shell on mobile', () => {
  beforeEach(() => {
    setViewport('mobile');
  });

  it('opens the navigation as a drawer and closes it with Escape', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    const menuButton = screen.getByRole('button', { name: 'Ouvrir la navigation' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(menuButton);

    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByText(testUser.displayName)).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer with its close button', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await user.click(screen.getByRole('button', { name: 'Ouvrir la navigation' }));
    await user.click(screen.getByRole('button', { name: 'Fermer la navigation' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('docks the sidebar when the window becomes wide', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    await user.click(screen.getByRole('button', { name: 'Ouvrir la navigation' }));

    setViewport('desktop');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });
});
