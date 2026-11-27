/**
 * Gives the admin role to an existing account.
 *
 *   npm run user:promote                        → prompts for the email
 *   node dist/cli/promote-user.js --email alice@example.com
 *
 * The change applies at once, including to sessions already open (the role is read from the
 * database on every request). In Docker: `docker compose exec api node dist/cli/promote-user.js`
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createPrismaClient } from '../prisma/create-prisma-client.js';
import { promoteUser } from '../users/promote-user.js';
import { emailSchema } from '../users/users.schemas.js';
import { createPrompter } from './prompt.js';

const USAGE = 'Usage: npm run user:promote (interactive) — or: --email <email>';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const { values } = parseArgs({ options: { email: { type: 'string' } } });
  const prompter = createPrompter();
  let email: string;
  try {
    email = values.email ?? (await prompter.ask('Email of the account to promote: '));
  } finally {
    prompter.close();
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    throw new Error(`Invalid email:\n${z.prettifyError(parsed.error)}\n\n${USAGE}`);
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const user = await promoteUser(prisma, parsed.data);
    if (!user) throw new Error(`No account with email "${parsed.data}"`);
    console.log(`✔ ${user.email} is now an admin (${user.displayName}) — id ${user.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
