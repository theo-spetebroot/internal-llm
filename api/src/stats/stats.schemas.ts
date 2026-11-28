import { z } from 'zod';

import { isValidTimeZone } from './time-zone.js';

/** Periods the stats can cover, in days (today included). */
export const STATS_PERIOD_DAYS = [7, 30, 90] as const;
export const DEFAULT_STATS_DAYS = 30;
export const DEFAULT_STATS_TIME_ZONE = 'UTC';

/**
 * Query of `GET /api/stats/me` and `GET /api/admin/stats`. Unknown parameters are ignored.
 * Deliberately has no `id`: `ZodQuery` documents each property as a query parameter, which
 * needs them inline.
 */
export const statsQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.literal(STATS_PERIOD_DAYS, { error: 'days must be 7, 30 or 90' }))
    .default(DEFAULT_STATS_DAYS)
    .meta({
      description: 'Length of the period, in days, today included',
      type: 'integer',
      enum: [...STATS_PERIOD_DAYS],
    }),
  tz: z
    .string()
    .refine(isValidTimeZone, { error: 'tz must be an IANA time zone, e.g. Europe/Paris' })
    .default(DEFAULT_STATS_TIME_ZONE)
    .meta({ description: 'IANA time zone the days are cut in (default UTC)' }),
});

export type StatsQuery = z.output<typeof statsQuerySchema>;

const count = z.number().int().nonnegative();

/** Token counts split by origin: what the provider reported and what was estimated. */
const tokenCountsSchema = z
  .object({
    total: count,
    estimated: count.describe('Counted with a heuristic (about 4 characters per token)'),
    reported: count.describe('Reported by the LLM provider'),
  })
  .meta({ id: 'StatsTokenCounts' });

const outcomeSchema = z
  .object({
    count,
    rate: z.number().min(0).max(1).describe('Share of the requests of the period (0 to 1)'),
  })
  .meta({ id: 'StatsOutcome' });

const dailyPointSchema = z
  .object({
    date: z.string().describe('Calendar day, YYYY-MM-DD, in the requested time zone'),
    requests: count,
    promptTokens: count,
    completionTokens: count,
  })
  .meta({ id: 'StatsDailyPoint' });

/**
 * The figures of a period, whoever they cover: one user (`UserStats`) or the whole instance.
 * It has no `id` of its own, so each response schema built on it is named separately.
 */
export const usageStatsSchema = z.object({
  period: z
    .object({
      days: z.number().int(),
      timeZone: z.string(),
      from: z.string().describe('First day of the period, YYYY-MM-DD'),
      to: z.string().describe('Last day of the period (today), YYYY-MM-DD'),
    })
    .meta({ id: 'StatsPeriod' }),
  /** LLM calls started in the period. */
  requests: count,
  tokens: z.object({ prompt: tokenCountsSchema, completion: tokenCountsSchema }),
  /** Null when there is no data to average. */
  averages: z.object({
    durationMs: z.number().int().nonnegative().nullable(),
    timeToFirstTokenMs: z.number().int().nonnegative().nullable(),
  }),
  outcomes: z.object({
    completed: outcomeSchema,
    interrupted: outcomeSchema,
    error: outcomeSchema,
    timeout: outcomeSchema,
  }),
  /** One entry per day of the period, oldest first; days without activity are at 0. */
  daily: z.array(dailyPointSchema),
});

export const userStatsSchema = usageStatsSchema.meta({ id: 'UserStats' });

const userRankingEntrySchema = z
  .object({
    email: z.string(),
    displayName: z.string(),
    requests: count.describe("The user's LLM calls started in the period"),
    promptTokens: count,
    completionTokens: count,
    failureRate: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Share of the user's requests of the period that ended in an error or a timeout " +
          '(0 to 1, 0 without any request). A call the caller interrupted is not a failure. ' +
          'Not the same as `outcomes.error.rate`, which counts errors only (timeouts have ' +
          'their own outcome) and covers the whole instance.',
      ),
  })
  .meta({ id: 'StatsUserRankingEntry' });

/** Whole-instance figures: those of `UserStats`, over every user, plus the per-user ranking. */
export const adminStatsSchema = usageStatsSchema
  .extend({
    activeUsers: count.describe(
      'Accounts with at least one LLM call started in the period, whatever its outcome',
    ),
    users: z
      .array(userRankingEntrySchema)
      .describe(
        'Every account, most requests first (ties by email). An account without any call in ' +
          'the period is listed with zeros.',
      ),
  })
  .meta({ id: 'AdminStats' });

export type UsageStatsDto = z.infer<typeof usageStatsSchema>;
export type UserStatsDto = z.infer<typeof userStatsSchema>;
export type AdminStatsDto = z.infer<typeof adminStatsSchema>;
export type UserRankingEntryDto = z.infer<typeof userRankingEntrySchema>;
export type StatsDailyPointDto = z.infer<typeof dailyPointSchema>;
