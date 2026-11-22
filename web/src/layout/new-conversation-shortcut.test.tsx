import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setViewport } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend } from '@/test/server';

beforeEach(() => {
  backend.loggedIn = true;
});

async function openConversation() {
  const conversation = backend.addConversation({ title: 'En cours' });
  const view = renderApp(`/c/${conversation.id}`);
  await screen.findByRole('heading', { level: 1, name: 'En cours' });
  return view;
}

describe('new conversation shortcut', () => {
  it('opens a new conversation with Ctrl+Shift+O and focuses the composer', async () => {
    const { user, router } = await openConversation();

    await user.keyboard('{Control>}{Shift>}O{/Shift}{/Control}');

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });

  it('also accepts ⌘⇧O, even while typing in the composer', async () => {
    const { user, router } = await openConversation();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'brouillon');

    await user.keyboard('{Meta>}{Shift>}o{/Shift}{/Meta}');

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('starts over with an empty, focused composer when already on the home page', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'brouillon');
    await user.click(screen.getByRole('heading', { name: 'Bonjour, Théo.' }));

    await user.keyboard('{Control>}{Shift>}O{/Shift}{/Control}');

    const composer = await screen.findByRole('textbox', { name: 'Message' });
    expect(composer).toHaveValue('');
    expect(composer).toHaveFocus();
  });

  it('ignores the other combinations', async () => {
    const { user, router } = await openConversation();

    await user.keyboard('{Control>}o{/Control}');
    await user.keyboard('{Shift>}O{/Shift}');
    await user.keyboard('{Control>}{Alt>}{Shift>}O{/Shift}{/Alt}{/Control}');

    expect(router.state.location.pathname).not.toBe('/');
  });

  it('closes the mobile drawer', async () => {
    setViewport('mobile');
    const { user } = await openConversation();
    await user.click(screen.getByRole('button', { name: 'Ouvrir la navigation' }));
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}O{/Shift}{/Control}');

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is announced on the "new conversation" controls', async () => {
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Nouvelle conversation' });

    expect(link).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+O Meta+Shift+O');
    expect(link).toHaveTextContent('Ctrl+Maj+O');
  });
});
