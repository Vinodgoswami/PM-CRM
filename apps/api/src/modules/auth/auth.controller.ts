import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { type LoginInput, loginSchema, type SessionResponse } from '@salescrm/schemas';
import { type CookieOptions, type Request, type Response } from 'express';
import { APP_CONFIG } from '../../config.module';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { Authenticated, Public } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';
import { ABSOLUTE_TIMEOUT_MS, SESSION_COOKIE, SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax', path: '/' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { token, ...session } = await this.auth.login(body, req.ip ?? 'unknown', req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: ABSOLUTE_TIMEOUT_MS });
    return session;
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.revoke(user.sessionId);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Authenticated()
  @Get('session')
  session(@CurrentUser() user: SessionUser, @Req() req: Request): SessionResponse {
    return this.auth.sessionResponse(user, req.sessionToken!);
  }
}
