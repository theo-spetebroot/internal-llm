import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { backend, server } from '@/test/server';

beforeEach(() => {
  backend.loggedIn = true;
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function composer() {
  return screen.getByRole('textbox', { name: 'Message' });
}

async function openConversation(title = 'Buffering SSE') {
  const conversation = backend.addConversation({
    title,
    messages: [
      { role: 'user', content: 'Premier message' },
      { role: 'assistant', content: 'Première réponse' },
    ],
  });
  const view = renderApp(`/c/${conversation.id}`);
  await screen.findByRole('heading', { level: 1, name: title });
  return { ...view, conversation };
}

describe('sending a message', () => {
  it('shows the message at once and streams the answer', async () => {
    const hold = deferred();
    backend.chat = { answer: 'Gardez le timeout, il protège le flux.', hold: hold.promise };
    const { user } = await openConversation();

    await user.type(composer(), 'Et le timeout ?{Enter}');

    expect(composer()).toHaveValue('');
    const userMessages = await screen.findAllByRole('article', { name: 'Votre message' });
    expect(userMessages.at(-1)).toHaveTextContent('Et le timeout ?');

    const streaming = (await screen.findByText('En train d’écrire…')).closest('article');
    expect(streaming).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => {
      expect(streaming).toHaveTextContent('Gardez');
    });
    expect(screen.getByRole('button', { name: 'Arrêter la réponse' })).toBeInTheDocument();

    hold.resolve();

    // The second answer is saved once it shows its time instead of "En train d'écrire…".
    await waitFor(() => {
      expect(screen.getAllByRole('article', { name: 'Réponse du modèle' })[1]).toHaveTextContent(
        /Réponse · \d{2}:\d{2}/,
      );
    });
    expect(screen.queryByText('En train d’écrire…')).not.toBeInTheDocument();
    const answers = screen.getAllByRole('article', { name: 'Réponse du modèle' });
    expect(answers).toHaveLength(2);
    expect(answers[1]).toHaveTextContent('Gardez le timeout, il protège le flux.');
    expect(answers[1]).toHaveTextContent(/Réponse · \d{2}:\d{2}/);
    // Each message is shown once, from the cache, after the exchange.
    expect(screen.getAllByRole('article', { name: 'Votre message' })).toHaveLength(2);
  });

  it('moves the conversation to the top of the list', async () => {
    backend.addConversation({ title: 'Plus récente', lastMessageAt: new Date().toISOString() });
    const { user } = await openConversation('Plus ancienne');
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    await within(nav).findByRole('link', { name: 'Plus récente' });

    await user.type(composer(), 'Relance{Enter}');

    await waitFor(() => {
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Plus ancienne', 'Plus récente']);
    });
  });

  it('starts a new conversation from the home page, titled from the first message', async () => {
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await user.type(composer(), 'Comment configurer nginx pour du SSE ?{Enter}');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Comment configurer nginx pour du SSE ?',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/c\/conversation-\d+$/);
    // Wait for the saved answer (with its time), not the one being written.
    await waitFor(() => {
      expect(screen.getByRole('article', { name: 'Réponse du modèle' })).toHaveTextContent(
        /Réponse · \d{2}:\d{2}/,
      );
    });
    expect(screen.getByRole('article', { name: 'Réponse du modèle' })).toHaveTextContent(
      'Réponse à : Comment configurer nginx pour du SSE ?',
    );
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    expect(
      within(nav).getByRole('link', { name: 'Comment configurer nginx pour du SSE ?' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the draft when the conversation cannot be created', async () => {
    server.use(http.post('/api/conversations', () => new HttpResponse(null, { status: 500 })));
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await user.type(composer(), 'Bonjour{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('n’a pas pu être créée');
    expect(composer()).toHaveValue('Bonjour');
    expect(router.state.location.pathname).toBe('/');
  });

  it('goes to the next line with Shift+Enter and never sends an empty message', async () => {
    const { user } = await openConversation();

    await user.type(composer(), 'ligne 1{Shift>}{Enter}{/Shift}ligne 2');
    expect(composer()).toHaveValue('ligne 1\nligne 2');

    await user.clear(composer());
    await user.type(composer(), '   {Enter}');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    expect(backend.sendRequests).toBe(0);
  });

  it('shows the partial answer and the reason when the model fails', async () => {
    backend.chat = { error: { code: 'LLM_TIMEOUT', partial: 'Il était une fois' } };
    const { user } = await openConversation();

    await user.type(composer(), 'Une histoire{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le modèle a mis trop de temps à répondre.',
    );
    const answers = screen.getAllByRole('article', { name: 'Réponse du modèle' });
    expect(answers.at(-1)).toHaveTextContent('Il était une fois');
    expect(answers.at(-1)).toHaveTextContent('Réponse interrompue');
    expect(screen.getAllByRole('article', { name: 'Votre message' }).at(-1)).toHaveTextContent(
      'Une histoire',
    );
  });

  it.each([
    [409, 'Une réponse est déjà en cours de génération dans cette conversation.'],
    [400, 'Ce message est vide ou trop long.'],
    [500, 'Le serveur a rencontré une erreur.'],
  ])('gives the draft back when the API answers %i', async (status, message) => {
    const { user, conversation } = await openConversation();
    server.use(
      http.post(`/api/conversations/${conversation.id}/messages`, () =>
        HttpResponse.json({ statusCode: status }, { status }),
      ),
    );

    await user.type(composer(), 'Mon message{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(composer()).toHaveValue('Mon message');
    expect(screen.getAllByRole('article', { name: 'Votre message' })).toHaveLength(1);
  });

  it('gives the draft back when the server is unreachable', async () => {
    const { user, conversation } = await openConversation();
    server.use(
      http.post(`/api/conversations/${conversation.id}/messages`, () => HttpResponse.error()),
    );

    await user.type(composer(), 'Mon message{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur est injoignable.');
    expect(composer()).toHaveValue('Mon message');
  });

  it('reloads the conversation when the stream breaks the contract', async () => {
    const { user, conversation } = await openConversation();
    backend.chat = { raw: ['event: start\ndata: {"type":"start"}\n\n'] };
    // What the API saved, unknown to the client until it reloads.
    conversation.messages.push({
      id: 'saved',
      role: 'user',
      content: 'Enregistré côté serveur',
      interrupted: false,
      createdAt: new Date().toISOString(),
    });

    await user.type(composer(), 'Mon message{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('La réponse a été interrompue.');
    expect(await screen.findByText('Enregistré côté serveur')).toBeInTheDocument();
  });
});
