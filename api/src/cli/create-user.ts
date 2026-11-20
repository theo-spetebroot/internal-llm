/**
 * Creates a user account (there is no public sign-up).
 *
 *   npm run user:create -- --email alice@example.com --name Alice
 *
 * The password is prompted without echo (or read from stdin when piped).
 * In Docker: `docker compose exec api node dist/cli/create-user.js --email ... --name ...`
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createPrismaClient } from '../prisma/create-prisma-client.js';
import { createUser } from '../users/create-user.js';
import { createUserSchema, PASSWORD_MIN_LENGTH } from '../users/users.schemas.js';
import { promptHidden } from './prompt-hidden.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
    },
  });

  const password = await promptHidden(`Password (min. ${PASSWORD_MIN_LENGTH} characters): `);
  const parsed = createUserSchema.safeParse({
    email: values.email,
    displayName: values.name,
    password,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid input:\n${z.prettifyError(parsed.error)}\n\n` +
        'Usage: npm run user:create -- --email <email> --name <display name>',
    );
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const user = await createUser(prisma, parsed.data);
    console.log(`✔ User created: ${user.email} (${user.displayName}) — id ${user.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
