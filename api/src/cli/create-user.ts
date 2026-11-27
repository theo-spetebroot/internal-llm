/**
 * Creates a user account (there is no public sign-up).
 *
 *   npm run user:create                      → prompts for email, name, admin role and password
 *   node dist/cli/create-user.js --email alice@example.com --name Alice [--admin]
 *
 * The admin question is asked only in interactive mode (no --email and no --name), so that
 * scripts with flags are never asked for more input. `--admin` makes the account an admin in
 * either mode. The password is always prompted, without echo (or read from stdin when piped).
 * In Docker: `docker compose exec api node dist/cli/create-user.js`
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { createPrismaClient } from '../prisma/create-prisma-client.js';
import { createUser } from '../users/create-user.js';
import { createUserSchema, PASSWORD_MIN_LENGTH } from '../users/users.schemas.js';
import { UserRole } from '../generated/prisma/enums.js';
import { createPrompter } from './prompt.js';

const USAGE =
  'Usage: npm run user:create (interactive) — or: --email <email> --name <display name> [--admin]';

const YES_ANSWERS = new Set(['y', 'yes', 'o', 'oui']);

interface Flags {
  email?: string | undefined;
  name?: string | undefined;
  admin?: boolean | undefined;
}

function parseFlags(): Flags {
  try {
    return parseArgs({
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        admin: { type: 'boolean' },
      },
    }).values;
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
  const interactive = flags.email === undefined && flags.name === undefined;
  const prompter = createPrompter();
  let input: unknown;
  let admin: boolean;
  try {
    const email = flags.email ?? (await prompter.ask('Email: '));
    const displayName = flags.name ?? (await prompter.ask('Display name: '));
    admin =
      flags.admin ??
      (interactive
        ? YES_ANSWERS.has((await prompter.ask('Administrator? (y/N): ')).trim().toLowerCase())
        : false);
    const password = await prompter.askHidden(
      `Password (min. ${PASSWORD_MIN_LENGTH} characters): `,
    );
    input = { email, displayName, password };
  } finally {
    prompter.close();
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid input:\n${z.prettifyError(parsed.error)}\n\n${USAGE}`);
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const user = await createUser(prisma, parsed.data, admin ? UserRole.ADMIN : UserRole.USER);
    console.log(
      `✔ User created: ${user.email} (${user.displayName}, ${user.role}) — id ${user.id}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
