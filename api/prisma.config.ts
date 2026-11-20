import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load api/.env for local CLI usage (migrate dev, studio). In Docker, variables come from the
// container environment and no .env file exists.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Not needed by `prisma generate` (e.g. during the Docker build), hence the fallback.
    url: process.env['DATABASE_URL'] ?? '',
  },
});
