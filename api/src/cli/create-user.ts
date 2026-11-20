/**
 * Creates a user account (there is no public sign-up).
 *
 *   npm run user:create                      → prompts for email, name and password
 *   node dist/cli/create-user.js --email alice@example.com --name Alice
 *
 * The password is always prompted, without echo (or read from stdin when piped).
 * In Docker: `docker compose exec api node dist/cli/create-user.js`
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createPrismaClient } from '../prisma/create-prisma-client.js';
import { createUser } from '../users/create-user.js';
import { createUserSchema, PASSWORD_MIN_LENGTH } from '../users/users.schemas.js';
import { createPrompter } from './prompt.js';

const USAGE =
  'Usage: npm run user:create (interactive) — or: --email <email> --name <display name>';

function parseFlags(): { email?: string | undefined; name?: string | undefined } {
  try {
    return parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } }).values;
  } catch (error) {
    // Typical cause: PowerShell drops the `--` in `npm run user:create -- --email ...`, so npm
    // consumes the flags itself and only their values reach the script.
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n` +
        'With PowerShell, run `npm run user:create` without arguments to be prompted.',
      { cause: error },
    );
  }
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const flags = parseFlags();
  const prompter = createPrompter();
  let input: unknown;
  try {
    input = {
      email: flags.email ?? (await prompter.ask('Email: ')),
      displayName: flags.name ?? (await prompter.ask('Display name: ')),
      password: await prompter.askHidden(`Password (min. ${PASSWORD_MIN_LENGTH} characters): `),
    };
  } finally {
    prompter.close();
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid input:\n${z.prettifyError(parsed.error)}\n\n${USAGE}`);
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
