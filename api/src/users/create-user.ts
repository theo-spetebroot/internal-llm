import { hashPassword } from '../auth/password.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { UserRole } from '../generated/prisma/enums.js';
import { type CreateUserInput, type UserDto, userSchema } from './users.schemas.js';

export class EmailAlreadyUsedError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = 'EmailAlreadyUsedError';
  }
}

/**
 * Creates a user account. There is no public sign-up: this is used by the `user:create` CLI
 * (and by tests). Expects input already validated with `createUserSchema`.
 */
export async function createUser(
  prisma: PrismaClient,
  input: CreateUserInput,
  role: UserRole = UserRole.USER,
): Promise<UserDto> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new EmailAlreadyUsedError(input.email);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      role,
    },
  });
  return userSchema.parse(user);
}
