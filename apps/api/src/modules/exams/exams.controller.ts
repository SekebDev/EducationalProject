import {
  Body,
  Controller,
  Delete,
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
import { ExamsService } from './exams.service.js';

function validId(value: string): string {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Prova não encontrada.');
  }
  return value;
}

@Controller('api/v1/exams')
export class ExamsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  @Post()
  @HttpCode(202)
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.exams.create(student.id, key, body);
  }

  @Get()
  async list(@Req() request: Request) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.exams.list(student.id);
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.exams.get(student.id, validId(id));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    await this.exams.delete(student.id, validId(id));
  }
}
