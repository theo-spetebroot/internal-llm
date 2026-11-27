/**
 * Deletes the recorded LLM calls older than the retention period, without waiting for the
 * daily purge. Conversations and messages are never touched.
 *
 *   npm run llm-calls:purge                       → keeps LLM_CALL_RETENTION_DAYS days (90)
 *   node dist/cli/purge-llm-calls.js --days 30    → keeps 30 days instead
 *
 * In Docker: `docker compose exec api node dist/cli/purge-llm-calls.js`
 * With PowerShell, `npm run` swallows `--days`: set `$env:LLM_CALL_RETENTION_DAYS` instead.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { envSchema } from '../config/env.schema.js';
import { purgeLlmCalls } from '../llm/llm-call.purge.js';
import { createPrismaClient } from '../prisma/create-prisma-client.js';

const USAGE = 'Usage: npm run llm-calls:purge — or: --days <retention in days>';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const { values } = parseArgs({ options: { days: { type: 'string' } } });
  // The same rules as the setting: a whole number of days, at least 1.
  const retention = envSchema.shape.LLM_CALL_RETENTION_DAYS.safeParse(
    values.days ?? process.env['LLM_CALL_RETENTION_DAYS'],
  );
  if (!retention.success) {
    throw new Error(`Invalid retention:\n${z.prettifyError(retention.error)}\n\n${USAGE}`);
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const { deleted, cutoff } = await purgeLlmCalls(prisma, retention.data);
    console.log(
      `✔ Deleted ${deleted} LLM call record(s) started before ${cutoff.toISOString()} ` +
        `(retention: ${retention.data} days)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
