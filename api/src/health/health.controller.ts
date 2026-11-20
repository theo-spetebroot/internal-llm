import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ZodResponse } from '../common/zod/zod.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type HealthResponse, healthResponseSchema } from './health.schemas.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: 'API and database are up',
    schema: healthResponseSchema,
  })
  @ZodResponse({ status: 503, description: 'Database unreachable', schema: healthResponseSchema })
  async check(): Promise<HealthResponse> {
    if (!(await this.prisma.isHealthy())) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      } satisfies HealthResponse);
    }
    return { status: 'ok', database: 'up' };
  }
}
