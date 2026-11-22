import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import type { User } from '@/api/client';

export const testUser: User = {
  id: 'user-1',
  email: 'theo@exemple.fr',
  displayName: 'Théo Martin',
  createdAt: '2026-11-20T10:00:00.000Z',
};

export const TEST_PASSWORD = 'correct horse battery staple';

const loginBodySchema = z.object({ email: z.string(), password: z.string() });

/** In-memory stand-in for the API session: tests flip `loggedIn` to start authenticated. */
export const backend = {
  loggedIn: false,
  loginRequests: 0,
  reset() {
    this.loggedIn = false;
    this.loginRequests = 0;
  },
};

export const handlers = [
  http.get('/api/auth/me', () =>
    backend.loggedIn ? HttpResponse.json(testUser) : new HttpResponse(null, { status: 401 }),
  ),

  http.post('/api/auth/login', async ({ request }) => {
    backend.loginRequests += 1;
    const body: unknown = await request.json();
    const credentials = loginBodySchema.parse(body);
    if (credentials.email !== testUser.email || credentials.password !== TEST_PASSWORD) {
      return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    backend.loggedIn = true;
    return HttpResponse.json(testUser);
  }),

  http.post('/api/auth/logout', () => {
    backend.loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
];

export const server = setupServer(...handlers);
