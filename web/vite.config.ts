import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Server-side settings only (no VITE_ prefix): never exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env['API_PROXY_TARGET'] ?? 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Same origin as the page: the session cookie (SameSite=Strict) and SSE work as in
      // production, where the web server proxies /api to the API container.
      proxy: { '/api': { target: apiTarget } },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  };
});
