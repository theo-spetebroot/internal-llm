import createClient, { type Middleware } from 'openapi-fetch';

import type { components, paths } from './schema';

export type User = components['schemas']['User'];

/** A non-2xx answer the caller did not expect. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Unexpected API response (HTTP ${status})`);
    this.name = 'ApiError';
  }
}

let unauthorizedHandler: (() => void) | undefined;

/** Called when a request outside /api/auth answers 401, i.e. the session has expired. */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

export const sessionExpiryMiddleware: Middleware = {
  onResponse({ request, response }) {
    // /api/auth/me answering 401 just means "not logged in"; login 401 is a wrong password.
    if (response.status === 401 && !new URL(request.url).pathname.startsWith('/api/auth/')) {
      unauthorizedHandler?.();
    }
  },
};

/**
 * Typed client generated from api/openapi.json (`npm run gen:api`). The API is served on the
 * same origin (Vite proxy in development, web server in production), so the session cookie
 * is sent automatically.
 */
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: 'same-origin',
  // Looked up on each call rather than captured at import time, so that request mocking
  // (MSW in the tests) applies.
  fetch: (request) => globalThis.fetch(request),
});
api.use(sessionExpiryMiddleware);
