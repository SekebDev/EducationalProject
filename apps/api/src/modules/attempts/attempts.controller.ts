import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import { answerSchema, submitSchema } from './dto/attempts.dto.js';
import type { AnswerDto, SubmitAttemptDto } from './dto/attempts.dto.js';
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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { AttemptsService } from './attempts.service.js';
import { SubmissionService } from './submission.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1/attempts')
export class AttemptsController {
  constructor(
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(SubmissionService) private readonly submission: SubmissionService,
  ) {}

  @Get()
  async list(@CurrentStudent() student: CurrentStudentEntity) {
    return this.attempts.list(student.id);
  }

  @Get(':id')
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
  ) {
    return this.attempts.get(student.id, id);
  }

  @Get(':id/result')
  async result(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
  ) {
    return this.submission.result(student.id, id);
  }

  @Post(':id/submit')
  async submit(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
    @Body(
      new ZodValidationPipe(
        submitSchema,
        'SUBMISSION_INVALID',
        'Confira a entrega.',
      ),
    )
    body: SubmitAttemptDto,
  ) {
    return this.submission.submit(
      student.id,
      id,
      body.expectedVersion,
      body.acceptUnanswered,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
  ): Promise<void> {
    await this.submission.delete(student.id, id);
  }

  @Put(':id/answers/:questionId/draft')
  async draft(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
    @Param('questionId', new ResourceIdPipe('Recurso não encontrado.'))
    questionId: string,
    @Body(
      new ZodValidationPipe(
        answerSchema,
        'ANSWER_INVALID',
        'Confira a resposta.',
      ),
    )
    body: AnswerDto,
  ) {
    return this.attempts.draft(
      student.id,
      id,
      questionId,
      body.value,
      body.expectedVersion,
    );
  }

  @Post(':id/answers/:questionId/confirm')
  async confirm(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.')) id: string,
    @Param('questionId', new ResourceIdPipe('Recurso não encontrado.'))
    questionId: string,
    @Headers('idempotency-key') key: string,
    @Body(
      new ZodValidationPipe(
        answerSchema,
        'ANSWER_INVALID',
        'Confira a resposta.',
      ),
    )
    body: AnswerDto,
  ) {
    if (!z.uuid().safeParse(key).success) {
      throw new PublicError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Envie uma chave UUID.',
      );
    }
    return this.attempts.confirm(
      student.id,
      id,
      questionId,
      body.value,
      body.expectedVersion,
      key,
    );
  }
}
