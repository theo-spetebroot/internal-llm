import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service.js';
import { type UserDto, userSchema } from '../users/users.schemas.js';
import type { JwtPayload, LoginInput } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';

@Injectable()
export class AuthService {
  /**
   * Hash verified when the email is unknown, so that a login attempt takes the same time
   * whether or not the account exists (prevents user enumeration by timing).
   */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Returns the user when credentials are valid; a single generic 401 otherwise. */
  async validateCredentials({ email, password }: LoginInput): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    this.dummyHash ??= hashPassword('dummy-password-for-constant-time');
    const isValid = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);

    if (!user || !isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return userSchema.parse(user);
  }

  signSessionToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId } satisfies JwtPayload);
  }

  async findUserById(id: string): Promise<UserDto | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? userSchema.parse(user) : null;
  }
}
