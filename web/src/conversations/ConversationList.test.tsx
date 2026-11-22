import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { setViewport } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend, server } from '@/test/server';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  backend.loggedIn = true;
});

function conversationNav() {
  return screen.getByRole('navigation', { name: 'Conversations' });
}

describe('conversation list', () => {
  it('lists the conversations, most recently active first, grouped by date', async () => {
    backend.addConversation({
      title: 'Ancienne',
      lastMessageAt: new Date(2025, 0, 5).toISOString(),
    });
    backend.addConversation({ title: 'Récente' });
    backend.addConversation({
      title: 'Plus récente',
      lastMessageAt: new Date(Date.now() + 1000).toISOString(),
    });
    renderApp('/');

    await screen.findByRole('link', { name: 'Récente' });
    const today = within(conversationNav()).getByRole('region', { name: 'Aujourd’hui' });
    expect(
      within(today)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Plus récente', 'Récente']);
    const older = within(conversationNav()).getByRole('region', { name: 'Plus ancien' });
    expect(within(older).getByRole('link', { name: 'Ancienne' })).toBeInTheDocument();
  });

  it('says when there is no conversation yet', async () => {
    renderApp('/');

    expect(await screen.findByText('Aucune conversation pour l’instant.')).toBeInTheDocument();
  });

  it('opens a conversation and highlights it', async () => {
    const conversation = backend.addConversation({ title: 'Buffering SSE derrière nginx' });
    backend.addConversation({
      title: 'Autre',
      lastMessageAt: new Date(Date.now() - DAY).toISOString(),
    });
    const { user, router } = renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Buffering SSE derrière nginx' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Buffering SSE derrière nginx' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/c/${conversation.id}`);
    expect(screen.getByRole('link', { name: 'Buffering SSE derrière nginx' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Autre' })).not.toHaveAttribute('aria-current');
  });

  it('shows "not found" for a conversation that does not exist for this user', async () => {
    renderApp('/c/someone-elses-conversation');

    expect(await screen.findByRole('heading', { name: 'Page introuvable.' })).toBeInTheDocument();
  });

  it('offers to retry when the list cannot be loaded', async () => {
    server.use(
      http.get('/api/conversations', () => new HttpResponse(null, { status: 500 }), { once: true }),
    );
    backend.addConversation({ title: 'Récente' });
    const { user } = renderApp('/');

    expect(await screen.findByText('Impossible de charger les conversations.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('link', { name: 'Récente' })).toBeInTheDocument();
  });

  it('closes the mobile drawer once a conversation is chosen', async () => {
    setViewport('mobile');
    backend.addConversation({ title: 'Récente' });
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await user.click(screen.getByRole('button', { name: 'Ouvrir la navigation' }));
    await user.click(await screen.findByRole('link', { name: 'Récente' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Récente' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links to a new conversation from the sidebar', async () => {
    const conversation = backend.addConversation({ title: 'Récente' });
    const { user, router } = renderApp(`/c/${conversation.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Récente' });

    await user.click(screen.getByRole('link', { name: 'Nouvelle conversation' }));

    expect(router.state.location.pathname).toBe('/');
  });
});
