import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { backend } from '@/test/server';

import { formatMessageTime } from './format-time';

beforeEach(() => {
  backend.loggedIn = true;
});

describe('conversation thread', () => {
  it('shows the messages in order, user messages and answers apart', async () => {
    const conversation = backend.addConversation({
      title: 'Buffering SSE',
      messages: [
        { role: 'user', content: 'Pourquoi tout arrive à la fin ?' },
        { role: 'assistant', content: 'C’est le buffering de nginx.' },
        { role: 'user', content: 'Et le timeout ?' },
        { role: 'assistant', content: 'Gardez-le.' },
      ],
    });
    renderApp(`/c/${conversation.id}`);

    await screen.findByRole('heading', { level: 1, name: 'Buffering SSE' });
    const articles = screen.getAllByRole('article');
    expect(articles.map((article) => article.getAttribute('aria-label'))).toEqual([
      'Votre message',
      'Réponse du modèle',
      'Votre message',
      'Réponse du modèle',
    ]);
    expect(articles[0]).toHaveTextContent('Pourquoi tout arrive à la fin ?');
    expect(articles[3]).toHaveTextContent('Gardez-le.');
  });

  it('marks an interrupted answer', async () => {
    const conversation = backend.addConversation({
      messages: [
        { role: 'user', content: 'Raconte une longue histoire' },
        { role: 'assistant', content: 'Il était une fois', interrupted: true },
      ],
    });
    renderApp(`/c/${conversation.id}`);

    const answer = await screen.findByRole('article', { name: 'Réponse du modèle' });
    expect(within(answer).getByText('Réponse interrompue')).toBeInTheDocument();
  });

  it('keeps line breaks and never interprets content as HTML', async () => {
    const conversation = backend.addConversation({
      messages: [{ role: 'user', content: '<img src=x onerror=alert(1)>\nligne 2' }],
    });
    renderApp(`/c/${conversation.id}`);

    const message = await screen.findByRole('article', { name: 'Votre message' });
    expect(message.textContent).toBe('<img src=x onerror=alert(1)>\nligne 2');
    expect(message.querySelector('img')).toBeNull();
  });

  it('says when a conversation has no message yet', async () => {
    const conversation = backend.addConversation({ title: 'Vide' });
    renderApp(`/c/${conversation.id}`);

    expect(await screen.findByText('Aucun message pour l’instant.')).toBeInTheDocument();
  });
});

describe('formatMessageTime', () => {
  const now = new Date(2026, 10, 19, 15, 0);

  it('shows only the time for today', () => {
    expect(formatMessageTime(new Date(2026, 10, 19, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('adds the date otherwise', () => {
    expect(formatMessageTime(new Date(2026, 10, 18, 9, 5).toISOString(), now)).toBe(
      '18 nov., 09:05',
    );
  });
});
