import type { PrismaClient } from '../generated/prisma/client.js';
import { UserRole } from '../generated/prisma/enums.js';
import { type UserDto, userSchema } from './users.schemas.js';

/**
 * Gives the ADMIN role to an existing account, looked up by its (normalised) email. Returns
 * null when no account has that email. Expects an email already validated with `emailSchema`.
 */
export async function promoteUser(prisma: PrismaClient, email: string): Promise<UserDto | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: UserRole.ADMIN },
  });
  return userSchema.parse(updated);
}
