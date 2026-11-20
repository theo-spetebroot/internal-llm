import { execSync } from 'node:child_process';

import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { TEST_DATABASE_URL } from './test-env.js';

/** Creates the test database if needed, then applies the migrations to it. */
export async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  if (!/^\w+$/.test(databaseName)) {
    throw new Error(`Unexpected test database name: ${databaseName}`);
  }

  url.pathname = '/postgres';
  const admin = createPrismaClient(url.toString());
  try {
    const existing = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
    if (existing.length === 0) {
      // Identifiers cannot be bound as parameters; the name is validated above.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
