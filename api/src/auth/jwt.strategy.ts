import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../config/env.schema.js';
import type { UserDto } from '../users/users.schemas.js';
import { SESSION_COOKIE } from './auth.constants.js';
import type { JwtPayload } from './auth.schemas.js';
import { AuthService } from './auth.service.js';

function extractFromCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[SESSION_COOKIE] ?? null;
}

/** Authenticates requests from the JWT stored in the httpOnly session cookie. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractFromCookie]),
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      ignoreExpiration: false,
    });
  }

  /** The returned value becomes `request.user`. Rejects tokens of deleted accounts. */
  async validate(payload: JwtPayload): Promise<UserDto> {
    const user = await this.authService.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
