import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setViewport } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend } from '@/test/server';

beforeEach(() => {
  backend.loggedIn = true;
});

describe('opening the usage page', () => {
  it('is reached from the sidebar, next to the account and the theme selector', async () => {
    const { user, router } = renderApp('/');
    const sidebar = await screen.findByRole('complementary');

    const link = within(sidebar).getByRole('link', { name: 'Usage' });
    expect(link).not.toHaveAttribute('aria-current');
    await user.click(link);

    expect(await screen.findByRole('heading', { name: 'Usage', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/usage');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Usage · internal-llm');
  });

  it('can be opened directly from its address', async () => {
    renderApp('/usage');

    expect(await screen.findByRole('heading', { name: 'Usage', level: 1 })).toBeInTheDocument();
    // The page itself is loaded on demand: its header is shown before its content.
    expect(await screen.findByRole('radiogroup', { name: 'Période' })).toBeInTheDocument();
  });

  it('closes the mobile drawer once the link is followed', async () => {
    setViewport('mobile');
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    await user.click(screen.getByRole('button', { name: 'Ouvrir la navigation' }));

    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    await user.click(within(drawer).getByRole('link', { name: 'Usage' }));

    expect(await screen.findByRole('heading', { name: 'Usage', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the period selector', () => {
  it('starts on 30 days', async () => {
    renderApp('/usage');

    expect(await screen.findByRole('radio', { name: '30 jours' })).toBeChecked();
  });

  it('keeps the period in the address and drops it for the default one', async () => {
    const { user, router } = renderApp('/usage');
    await screen.findByRole('radiogroup', { name: 'Période' });

    await user.click(screen.getByRole('radio', { name: '7 jours' }));
    expect(router.state.location.search).toBe('?periode=7');
    expect(screen.getByRole('radio', { name: '7 jours' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: '90 jours' }));
    expect(router.state.location.search).toBe('?periode=90');

    await user.click(screen.getByRole('radio', { name: '30 jours' }));
    expect(router.state.location.search).toBe('');
  });

  it('starts from the period of the address', async () => {
    renderApp('/usage?periode=90');

    expect(await screen.findByRole('radio', { name: '90 jours' })).toBeChecked();
  });

  it('ignores an unknown period in the address', async () => {
    renderApp('/usage?periode=14');

    expect(await screen.findByRole('radio', { name: '30 jours' })).toBeChecked();
  });

  it('is restored by the back button', async () => {
    const { user, router } = renderApp('/usage');
    await screen.findByRole('radiogroup', { name: 'Période' });
    await user.click(screen.getByRole('radio', { name: '7 jours' }));

    await router.navigate(-1);

    expect(await screen.findByRole('radio', { name: '30 jours' })).toBeChecked();
  });

  it('is reachable with the keyboard', async () => {
    const { user, router } = renderApp('/usage');
    await screen.findByRole('radiogroup', { name: 'Période' });

    screen.getByRole('radio', { name: '30 jours' }).focus();
    // Radix checks the radio it moves to on the next tick, and only while the arrow is still
    // down (as in a browser): hold the key until the selection has moved.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: '90 jours' })).toBeChecked();
    });
    await user.keyboard('{/ArrowRight}');

    expect(router.state.location.search).toBe('?periode=90');
  });
});
