import { Controller, Get, Module } from '@nestjs/common';

import { RequireAdmin } from '../../src/auth/decorators/require-admin.decorator.js';

@Controller('test-admin')
class AdminProbeController {
  @Get('probe')
  @RequireAdmin()
  probe(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Test-only module declaring one admin-only route. It is passed to `createTestApp` and is
 * never imported by the application.
 */
@Module({ controllers: [AdminProbeController] })
export class AdminProbeModule {}
