import type { PrismaClient } from '../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeResult {
  /** Number of LLM call records deleted. */
  deleted: number;
  /** Records that started before this instant were deleted. */
  cutoff: Date;
}

/**
 * Deletes the recorded LLM calls that started more than `retentionDays` days before `now`, for
 * every user. Only the `llm_calls` table is touched: conversations, messages and accounts are
 * never deleted here. `now` only exists so that tests can pin the clock.
 */
export async function purgeLlmCalls(
  prisma: PrismaClient,
  retentionDays: number,
  now = new Date(),
): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const { count } = await prisma.llmCall.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return { deleted: count, cutoff };
}
