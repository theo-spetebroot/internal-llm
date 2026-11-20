import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { UserDto } from '../../users/users.schemas.js';

/** The authenticated user, as returned by `JwtStrategy.validate`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request>();
  // Set by Passport on every route guarded by JwtAuthGuard.
  return request.user as UserDto;
});
