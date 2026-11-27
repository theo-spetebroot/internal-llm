import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ZodQuery, ZodResponse } from '../common/zod/zod.decorators.js';
import type { UserDto } from '../users/users.schemas.js';
import {
  type StatsQuery,
  statsQuerySchema,
  type UserStatsDto,
  userStatsSchema,
} from './stats.schemas.js';
import { StatsService } from './stats.service.js';

@ApiTags('stats')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('me')
  @ZodResponse({
    status: 200,
    description:
      "The caller's own usage over the period: LLM calls, tokens, response times and a per-day " +
      'series. Tokens come from the answers still stored: deleting a conversation removes its tokens.',
    schema: userStatsSchema,
  })
  @ZodResponse({ status: 400, description: 'Invalid `days` or `tz`' })
  me(
    @CurrentUser() user: UserDto,
    @ZodQuery(statsQuerySchema) query: StatsQuery,
  ): Promise<UserStatsDto> {
    return this.stats.getUserStats(user.id, query);
  }
}
