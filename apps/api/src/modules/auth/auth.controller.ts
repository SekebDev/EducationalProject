import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { readConfig } from '../../infrastructure/config.js';
import { getCookie, setCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimit } from './rate-limit.js';

const credentialsSchema = z.strictObject({
  email: z.email().max(320),
  password: z.string().min(12).max(128),
});
const resetRequestSchema = z.strictObject({ email: z.email().max(320) });
const resetConfirmSchema = z.strictObject({
  token: z.string().min(32),
  newPassword: z.string().min(12).max(128),
});

function credentials(body: unknown): z.infer<typeof credentialsSchema> {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    throw new PublicError(
      422,
      'INVALID_CREDENTIALS_FORMAT',
      'Verifique e-mail e senha.',
    );
  }
  return parsed.data;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(AuthRateLimit)
    private readonly rateLimit: AuthRateLimit,
  ) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response): { token: string } {
    const token = randomBytes(32).toString('base64url');
    setCookie(response, 'study_csrf', token, {
      maxAgeSeconds: 7 * 24 * 60 * 60,
      httpOnly: true,
      secure: readConfig(process.env).nodeEnv === 'production',
    });
    return { token };
  }

  @Post('register')
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = credentials(body);
    const csrf = getCookie(request, 'study_csrf');
    if (!csrf) {
      throw new PublicError(
        403,
        'CSRF_INVALID',
        'Atualize a página e tente novamente.',
      );
    }
    const result = await this.auth.register(input.email, input.password, csrf);
    this.setSession(response, result.token);
    response.status(201);
    return result.student;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = credentials(body);
    this.rateLimit.assertAllowed('login', request.ip ?? 'unknown', input.email);
    const csrf = getCookie(request, 'study_csrf');
    if (!csrf) {
      throw new PublicError(
        403,
        'CSRF_INVALID',
        'Atualize a página e tente novamente.',
      );
    }
    const result = await this.auth.login(input.email, input.password, csrf);
    this.setSession(response, result.token);
    return result.student;
  }

  @Get('me')
  async me(@Req() request: Request) {
    return this.auth.currentStudent(getCookie(request, 'study_session'));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(getCookie(request, 'study_session'));
    this.setSession(response, '', 0);
  }

  @Post('password-reset')
  @HttpCode(202)
  async passwordReset(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<void> {
    const parsed = resetRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new PublicError(422, 'INVALID_EMAIL', 'Informe um e-mail válido.');
    }
    this.rateLimit.assertAllowed(
      'reset',
      request.ip ?? 'unknown',
      parsed.data.email,
    );
    await this.auth.requestPasswordReset(parsed.data.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmPasswordReset(@Body() body: unknown): Promise<void> {
    const parsed = resetConfirmSchema.safeParse(body);
    if (!parsed.success) {
      throw new PublicError(
        422,
        'INVALID_RESET',
        'Verifique o link e a nova senha.',
      );
    }
    await this.auth.confirmPasswordReset(
      parsed.data.token,
      parsed.data.newPassword,
    );
  }

  private setSession(
    response: Response,
    token: string,
    maxAgeSeconds = 7 * 24 * 60 * 60,
  ): void {
    setCookie(response, 'study_session', token, {
      maxAgeSeconds,
      httpOnly: true,
      secure: readConfig(process.env).nodeEnv === 'production',
    });
  }
}
