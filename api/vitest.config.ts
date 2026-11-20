import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

import { TEST_ENV } from './test/test-env.js';

export default defineConfig({
  // esbuild (Vite's default transformer) does not emit decorator metadata, which Nest's
  // dependency injection relies on: compile with SWC instead.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: TEST_ENV,
    // e2e test files share one database: run them one at a time.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
