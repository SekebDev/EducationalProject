import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { DisputesService } from './disputes.service.js';

function id(value: string) {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Recurso não encontrado.');
  }
  return value;
}

@Controller('api/v1')
export class GradingController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DisputesService) private readonly disputes: DisputesService,
  ) {}

  @Get('answers/:id/grade-revisions')
  async revisions(@Req() request: Request, @Param('id') answerId: string) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.disputes.revisions(student.id, id(answerId));
  }

  @Post('answers/:id/disputes')
  async open(
    @Req() request: Request,
    @Param('id') answerId: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    const parsed = z
      .strictObject({ reason: z.string().min(1).max(2_000) })
      .safeParse(body);
    if (!parsed.success) {
      throw new PublicError(
        422,
        'DISPUTE_INVALID',
        'Explique o motivo da contestação.',
      );
    }
    return this.disputes.open(student.id, id(answerId), parsed.data.reason);
  }

  @Post('disputes/:id/reevaluate')
  async reevaluate(
    @Req() request: Request,
    @Param('id') disputeId: string,
    @Headers('idempotency-key') key: string,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.disputes.reevaluate(student.id, id(disputeId), key);
  }
}
