import { SessionGuard } from './session.guard.js';
import { CurrentStudent } from './current-student.decorator.js';
import type { CurrentStudentEntity } from './entities/student.entity.js';
import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import {
  credentialsSchema,
  resetRequestSchema,
  resetConfirmSchema,
} from './dto/auth.dto.js';
import type {
  CredentialsDto,
  RequestPasswordResetDto,
  ConfirmPasswordResetDto,
} from './dto/auth.dto.js';
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
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readConfig } from '../../infrastructure/config.js';
import { getCookie, setCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimit } from './rate-limit.js';

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
    @Body(
      new ZodValidationPipe(
        credentialsSchema,
        'INVALID_CREDENTIALS_FORMAT',
        'Verifique e-mail e senha.',
      ),
    )
    body: CredentialsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csrf = getCookie(request, 'study_csrf');
    if (!csrf) {
      throw new PublicError(
        403,
        'CSRF_INVALID',
        'Atualize a página e tente novamente.',
      );
    }
    const result = await this.auth.register(body.email, body.password, csrf);
    this.setSession(response, result.token);
    response.status(201);
    return result.student;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(
      new ZodValidationPipe(
        credentialsSchema,
        'INVALID_CREDENTIALS_FORMAT',
        'Verifique e-mail e senha.',
      ),
    )
    body: CredentialsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.rateLimit.assertAllowed('login', request.ip ?? 'unknown', body.email);
    const csrf = getCookie(request, 'study_csrf');
    if (!csrf) {
      throw new PublicError(
        403,
        'CSRF_INVALID',
        'Atualize a página e tente novamente.',
      );
    }
    const result = await this.auth.login(body.email, body.password, csrf);
    this.setSession(response, result.token);
    return result.student;
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentStudent() student: CurrentStudentEntity) {
    return student;
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
    @Body(
      new ZodValidationPipe(
        resetRequestSchema,
        'INVALID_EMAIL',
        'Informe um e-mail válido.',
      ),
    )
    body: RequestPasswordResetDto,
    @Req() request: Request,
  ): Promise<void> {
    this.rateLimit.assertAllowed('reset', request.ip ?? 'unknown', body.email);
    await this.auth.requestPasswordReset(body.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmPasswordReset(
    @Body(
      new ZodValidationPipe(
        resetConfirmSchema,
        'INVALID_RESET',
        'Verifique o link e a nova senha.',
      ),
    )
    body: ConfirmPasswordResetDto,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body.token, body.newPassword);
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
