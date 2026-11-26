import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { UserDto } from '../users/users.schemas.js';
import { AdminGuard } from './admin.guard.js';

function contextWithUser(user: UserDto | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const user = (role: 'USER' | 'ADMIN'): UserDto => ({
  id: 'user-1',
  email: 'someone@example.com',
  displayName: 'Someone',
  role,
  createdAt: new Date(),
});

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('lets admins through', () => {
    expect(guard.canActivate(contextWithUser(user('ADMIN')))).toBe(true);
  });

  it('refuses signed-in users who are not admins with 403', () => {
    expect(() => guard.canActivate(contextWithUser(user('USER')))).toThrow(ForbiddenException);
  });

  it('refuses a request without a user with 401', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(UnauthorizedException);
  });
});
