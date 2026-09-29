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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { AttemptsService } from './attempts.service.js';
import { SubmissionService } from './submission.service.js';

const answerSchema = z.strictObject({
  value: z.string().max(20_000),
  expectedVersion: z.number().int().nonnegative(),
});
const submitSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  acceptUnanswered: z.boolean(),
});

function validId(value: string) {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Recurso não encontrado.');
  }
  return value;
}

function input(value: unknown) {
  const result = answerSchema.safeParse(value);
  if (!result.success) {
    throw new PublicError(422, 'ANSWER_INVALID', 'Confira a resposta.');
  }
  return result.data;
}

@Controller('api/v1/attempts')
export class AttemptsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(SubmissionService) private readonly submission: SubmissionService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.attempts.list(student.id);
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.attempts.get(student.id, validId(id));
  }

  @Get(':id/result')
  async result(@Req() request: Request, @Param('id') id: string) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.submission.result(student.id, validId(id));
  }

  @Post(':id/submit')
  async submit(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new PublicError(422, 'SUBMISSION_INVALID', 'Confira a entrega.');
    }
    return this.submission.submit(
      student.id,
      validId(id),
      parsed.data.expectedVersion,
      parsed.data.acceptUnanswered,
    );
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
    await this.submission.delete(student.id, validId(id));
  }

  @Put(':id/answers/:questionId/draft')
  async draft(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    const answer = input(body);
    return this.attempts.draft(
      student.id,
      validId(id),
      validId(questionId),
      answer.value,
      answer.expectedVersion,
    );
  }

  @Post(':id/answers/:questionId/confirm')
  async confirm(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    if (!z.uuid().safeParse(key).success) {
      throw new PublicError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Envie uma chave UUID.',
      );
    }
    const answer = input(body);
    return this.attempts.confirm(
      student.id,
      validId(id),
      validId(questionId),
      answer.value,
      answer.expectedVersion,
      key,
    );
  }
}
