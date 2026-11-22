import { act, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { api } from '@/api/client';
import { renderApp } from '@/test/render';
import { TEST_PASSWORD, backend, server, testUser } from '@/test/server';

async function fillLoginForm(
  user: ReturnType<typeof renderApp>['user'],
  email: string,
  password: string,
) {
  if (email) await user.type(screen.getByLabelText('Adresse e-mail'), email);
  if (password) await user.type(screen.getByLabelText('Mot de passe'), password);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('authentication', () => {
  it('sends an anonymous visitor to the login page', async () => {
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
  });

  it('remembers the page that was asked for', async () => {
    const { router } = renderApp('/somewhere?tab=2');

    await screen.findByRole('heading', { name: 'Connexion' });
    expect(router.state.location.search).toBe(
      `?redirect=${encodeURIComponent('/somewhere?tab=2')}`,
    );
  });

  it('logs in and opens the home page', async () => {
    const { user, router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, `  ${testUser.email.toUpperCase()} `, TEST_PASSWORD);

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText(testUser.email)).toBeInTheDocument();
  });

  it('shows an error on wrong credentials and stays on the login page', async () => {
    const { user, router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, testUser.email, 'wrong password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Adresse e-mail ou mot de passe incorrect.',
    );
    expect(router.state.location.pathname).toBe('/login');
  });

  it('validates the form before calling the API', async () => {
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, 'not-an-email', '');

    expect(screen.getByText('Adresse e-mail invalide.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(backend.loginRequests).toBe(0);
  });

  it('tells the user when the server cannot be reached during login', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.error()));
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, testUser.email, TEST_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent('le serveur ne répond pas');
  });

  it('goes back to the requested page after logging in', async () => {
    const { user, router } = renderApp(`/login?redirect=${encodeURIComponent('/nowhere')}`);
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, testUser.email, TEST_PASSWORD);

    expect(await screen.findByRole('heading', { name: 'Page introuvable.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/nowhere');
  });

  it('ignores a redirect to another site', async () => {
    const { user, router } = renderApp(`/login?redirect=${encodeURIComponent('//evil.example')}`);
    await screen.findByRole('heading', { name: 'Connexion' });

    await fillLoginForm(user, testUser.email, TEST_PASSWORD);

    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends a logged-in user away from the login page', async () => {
    backend.loggedIn = true;
    const { router } = renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Bonjour, Théo.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('logs out', async () => {
    backend.loggedIn = true;
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(backend.loggedIn).toBe(false);
  });

  it('offers to retry when the server is unreachable', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.error(), { once: true }));
    const { user } = renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur est injoignable.');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('returns to the login page when the session expires', async () => {
    backend.loggedIn = true;
    server.use(http.get('/api/conversations', () => new HttpResponse(null, { status: 401 })));
    const { router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Bonjour, Théo.' });

    await act(async () => {
      await api.GET('/api/conversations');
    });

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});
