import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { UserDto } from '../users/users.schemas.js';

/**
 * Lets only admins through. Applied per route through `@RequireAdmin()`, so it runs after the
 * global JWT guard: a missing session is a 401, a signed-in non-admin is a 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user as UserDto | undefined;
    if (!user) throw new UnauthorizedException();
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return true;
  }
}
