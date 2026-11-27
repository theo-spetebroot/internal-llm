import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/prisma/create-prisma-client.js';
import { createUser } from '../src/users/create-user.js';
import { runCli } from './helpers/run-cli.js';
import { TEST_DATABASE_URL } from './test-env.js';

const PASSWORD = 'correct-horse-battery-staple';

const db = createPrismaClient(TEST_DATABASE_URL);

async function roleOf(email: string): Promise<string | undefined> {
  return (await db.user.findUnique({ where: { email } }))?.role;
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE TABLE users, conversations, messages, llm_calls CASCADE`;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('user CLI (e2e)', () => {
  describe('user:create', () => {
    it('creates a regular user with flags only', async () => {
      const result = await runCli(
        'create-user.ts',
        ['--email', 'member@example.com', '--name', 'Member'],
        `${PASSWORD}\n`,
      );

      expect(result.code).toBe(0);
      expect(await roleOf('member@example.com')).toBe('USER');
    });

    it('creates an admin with --admin, without asking the admin question', async () => {
      const result = await runCli(
        'create-user.ts',
        ['--email', 'boss@example.com', '--name', 'Boss', '--admin'],
        `${PASSWORD}\n`,
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('ADMIN');
      expect(await roleOf('boss@example.com')).toBe('ADMIN');
    });

    it('asks the admin question in interactive mode', async () => {
      const result = await runCli('create-user.ts', [], `ada@example.com\nAda\ny\n${PASSWORD}\n`);

      expect(result.code).toBe(0);
      expect(await roleOf('ada@example.com')).toBe('ADMIN');
    });

    it('creates a regular user when the admin question is answered no', async () => {
      await runCli('create-user.ts', [], `bob@example.com\nBob\nn\n${PASSWORD}\n`);

      expect(await roleOf('bob@example.com')).toBe('USER');
    });
  });

  describe('user:promote', () => {
    it('gives the admin role to an existing account', async () => {
      await createUser(db, {
        email: 'alice@example.com',
        displayName: 'Alice',
        password: PASSWORD,
      });

      const result = await runCli('promote-user.ts', ['--email', 'alice@example.com'], '');

      expect(result.code).toBe(0);
      expect(await roleOf('alice@example.com')).toBe('ADMIN');
    });

    it('asks for the email when no flag is given', async () => {
      await createUser(db, {
        email: 'carol@example.com',
        displayName: 'Carol',
        password: PASSWORD,
      });

      const result = await runCli('promote-user.ts', [], 'Carol@Example.com\n');

      expect(result.code).toBe(0);
      expect(await roleOf('carol@example.com')).toBe('ADMIN');
    });

    it('fails without changing anything when no account has that email', async () => {
      const result = await runCli('promote-user.ts', ['--email', 'nobody@example.com'], '');

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No account with email "nobody@example.com"');
    });
  });
});
