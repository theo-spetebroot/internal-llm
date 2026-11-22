import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { backend } from '@/test/server';

beforeEach(() => {
  backend.loggedIn = true;
});

describe('stopping an answer', () => {
  it('stops the stream and keeps the received part as an interrupted answer', async () => {
    let release: () => void = () => undefined;
    backend.chat = {
      answer: 'Il était une fois un très long conte.',
      hold: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    const conversation = backend.addConversation({ title: 'Conte' });
    const { user } = renderApp(`/c/${conversation.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Conte' });

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Raconte{Enter}');
    const streaming = (await screen.findByText('En train d’écrire…')).closest('article');
    await waitFor(() => {
      expect(streaming).toHaveTextContent('Il');
    });

    await user.click(screen.getByRole('button', { name: 'Arrêter la réponse' }));

    await waitFor(() => {
      expect(screen.queryByText('En train d’écrire…')).not.toBeInTheDocument();
    });
    const answer = screen.getByRole('article', { name: 'Réponse du modèle' });
    expect(answer).toHaveTextContent('Il');
    expect(answer).not.toHaveTextContent('conte');
    expect(within(answer).getByText('Réponse interrompue')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Votre message' })).toHaveTextContent('Raconte');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    release();

    // Ready for the next message.
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arrêter la réponse' })).not.toBeInTheDocument();
  });

  it('only offers to stop while an answer is being written', async () => {
    const conversation = backend.addConversation({ title: 'Calme' });
    renderApp(`/c/${conversation.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Calme' });

    expect(screen.queryByRole('button', { name: 'Arrêter la réponse' })).not.toBeInTheDocument();
  });
});
