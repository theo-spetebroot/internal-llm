import { applyDecorators, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../admin.guard.js';

/**
 * Restricts a route or a controller to admins: 401 without a session, 403 for a signed-in
 * user whose role is not ADMIN. Admin routes are not other users' resources, so a 403 is the
 * documented answer here (unlike the 404 used for another user's data).
 */
export const RequireAdmin = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UseGuards(AdminGuard));
