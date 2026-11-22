import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import { installMatchMedia, resetMedia } from './media';
import { backend, server } from './server';

installMatchMedia();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

beforeEach(() => {
  resetMedia();
  backend.reset();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

afterAll(() => {
  server.close();
});
