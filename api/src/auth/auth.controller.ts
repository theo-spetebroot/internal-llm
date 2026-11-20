import { Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';

import { ZodBody, ZodResponse } from '../common/zod/zod.decorators.js';
import type { Env } from '../config/env.schema.js';
import { type UserDto, userSchema } from '../users/users.schemas.js';
import { SESSION_COOKIE } from './auth.constants.js';
import { type LoginInput, loginSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;
  private readonly sessionMaxAgeMs: number;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.get('COOKIE_SECURE', { infer: true }),
      path: '/',
    };
    this.sessionMaxAgeMs = config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }) * 1000;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({
    status: 200,
    description: 'Logged in; sets the session cookie',
    schema: userSchema,
  })
  @ZodResponse({ status: 400, description: 'Malformed request body' })
  @ZodResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @ZodBody(loginSchema) credentials: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    const user = await this.authService.validateCredentials(credentials);
    const token = await this.authService.signSessionToken(user.id);
    response.cookie(SESSION_COOKIE, token, { ...this.cookieOptions, maxAge: this.sessionMaxAgeMs });
    return user;
  }

  /** Public so that a client holding an expired session can still clear its cookie. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ZodResponse({ status: 204, description: 'Session cookie cleared' })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.cookieOptions);
  }

  @ApiCookieAuth(SESSION_COOKIE)
  @Get('me')
  @ZodResponse({ status: 200, description: 'The authenticated user', schema: userSchema })
  @ZodResponse({ status: 401, description: 'Missing, invalid or expired session' })
  me(@CurrentUser() user: UserDto): UserDto {
    return user;
  }
}
