import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { backend, server } from '@/test/server';

beforeEach(() => {
  backend.loggedIn = true;
});

async function openConversation(title = 'Ancien titre') {
  const conversation = backend.addConversation({ title });
  const view = renderApp(`/c/${conversation.id}`);
  await screen.findByRole('heading', { level: 1, name: title });
  return { ...view, conversation };
}

function sidebarLinks() {
  return within(screen.getByRole('navigation', { name: 'Conversations' }))
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('renaming a conversation', () => {
  it('edits the title in place and saves it with Enter', async () => {
    const { user, conversation } = await openConversation();

    await user.click(screen.getByRole('button', { name: 'Renommer la conversation' }));
    const input = screen.getByRole('textbox', { name: 'Titre de la conversation' });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Ancien titre');

    await user.clear(input);
    await user.type(input, '  Nouveau titre  {Enter}');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouveau titre' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(sidebarLinks()).toContain('Nouveau titre');
    });
    expect(backend.findConversation(conversation.id)?.title).toBe('Nouveau titre');
  });

  it('saves when the field loses focus', async () => {
    const { user } = await openConversation();

    await user.click(screen.getByRole('button', { name: 'Renommer la conversation' }));
    await user.type(screen.getByRole('textbox', { name: 'Titre de la conversation' }), ' bis');
    await user.click(screen.getByRole('textbox', { name: 'Message' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ancien titre bis' }),
    ).toBeInTheDocument();
  });

  it('cancels with Escape', async () => {
    const { user, conversation } = await openConversation();

    await user.click(screen.getByRole('button', { name: 'Renommer la conversation' }));
    await user.type(screen.getByRole('textbox', { name: 'Titre de la conversation' }), ' modifié');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('heading', { level: 1, name: 'Ancien titre' })).toBeInTheDocument();
    expect(backend.findConversation(conversation.id)?.title).toBe('Ancien titre');
  });

  it('ignores an empty title', async () => {
    const { user, conversation } = await openConversation();

    await user.click(screen.getByRole('button', { name: 'Renommer la conversation' }));
    await user.clear(screen.getByRole('textbox', { name: 'Titre de la conversation' }));
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { level: 1, name: 'Ancien titre' })).toBeInTheDocument();
    expect(backend.findConversation(conversation.id)?.title).toBe('Ancien titre');
  });

  it('says when the title could not be saved, and keeps the old one', async () => {
    const { user, conversation } = await openConversation();
    server.use(
      http.patch(`/api/conversations/${conversation.id}`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Renommer la conversation' }));
    await user.type(screen.getByRole('textbox', { name: 'Titre de la conversation' }), 'X{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Le renommage a échoué.');
    expect(screen.getByRole('heading', { level: 1, name: 'Ancien titre' })).toBeInTheDocument();
  });
});

describe('deleting a conversation', () => {
  it('asks for confirmation, then deletes and goes back home', async () => {
    backend.addConversation({ title: 'À garder' });
    const { user, router, conversation } = await openConversation('À supprimer');

    await user.click(screen.getByRole('button', { name: 'Supprimer la conversation' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer cette conversation ?' });
    expect(dialog).toHaveTextContent('« À supprimer » et tous ses messages');

    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sidebarLinks()).toEqual(['À garder']);
    expect(backend.findConversation(conversation.id)).toBeUndefined();
  });

  it('keeps the conversation when the deletion is cancelled', async () => {
    const { user, conversation } = await openConversation('À garder');

    await user.click(screen.getByRole('button', { name: 'Supprimer la conversation' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'À garder' })).toBeInTheDocument();
    expect(backend.findConversation(conversation.id)).toBeDefined();
  });

  it('stays in the dialog with a message when the deletion fails', async () => {
    const { user, conversation } = await openConversation('Tenace');
    server.use(
      http.delete(`/api/conversations/${conversation.id}`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer la conversation' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La suppression a échoué.');
    expect(backend.findConversation(conversation.id)).toBeDefined();
  });
});
