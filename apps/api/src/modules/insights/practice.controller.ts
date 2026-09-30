import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { PracticeService } from './practice.service.js';

function validId(id: string) {
  if (!z.uuid().safeParse(id).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Recomendação não encontrada.');
  }
  return id;
}

@Controller('api/v1/recommendations')
export class PracticeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PracticeService) private readonly practice: PracticeService,
  ) {}

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.practice.get(student.id, validId(id));
  }

  @Post(':id/practice')
  @HttpCode(202)
  async create(
    @Req() request: Request,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.practice.create(student.id, validId(id), key, body);
  }
}
