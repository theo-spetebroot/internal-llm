import { Controller, Get } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { RequireAdmin } from '../auth/decorators/require-admin.decorator.js';
import { ZodQuery, ZodResponse } from '../common/zod/zod.decorators.js';
import {
  type AdminStatsDto,
  adminStatsSchema,
  type StatsQuery,
  statsQuerySchema,
} from './stats.schemas.js';
import { StatsService } from './stats.service.js';

/**
 * Instance-wide figures. Unlike the user routes it reads every user's data, on purpose: the
 * role check is what protects it (`@RequireAdmin()`: 401 without a session, 403 for a user who
 * is not an admin; admin routes are not another user's resource, so there is no 404 here).
 */
@ApiTags('admin')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
@ApiForbiddenResponse({ description: 'Signed in, but not an admin' })
@RequireAdmin()
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description:
      'The usage of the whole instance over the period, with the same figures and the same ' +
      "parameters as `GET /api/stats/me` (all users' LLM calls, tokens, response times and a " +
      'per-day series), plus the number of active users (accounts with at least one call in ' +
      'the period) and a ranking of every account: email, display name, requests, tokens and ' +
      'failure rate (errors and timeouts over requests). Nothing else about an account is ' +
      'returned.',
    schema: adminStatsSchema,
  })
  @ZodResponse({ status: 400, description: 'Invalid `days` or `tz`' })
  get(@ZodQuery(statsQuerySchema) query: StatsQuery): Promise<AdminStatsDto> {
    return this.stats.getAdminStats(query);
  }
}
