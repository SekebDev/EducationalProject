import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  studyChangeSchema,
  studyHistorySchema,
  studyQuestionSchema,
} from '@study/contracts';
import type { StudyChange, StudyQuestion } from '@study/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { PdfStudyService } from './pdf-study.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1')
export class PdfStudyController {
  constructor(
    @Inject(PdfStudyService) private readonly studies: PdfStudyService,
  ) {}

  @Get('pdf-studies')
  list(@CurrentStudent() student: CurrentStudentEntity) {
    return this.studies.list(student.id);
  }

  @Post('materials/:id/study')
  open(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
  ) {
    return this.studies.open(student.id, id);
  }

  @Get('materials/:id/study')
  get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
  ) {
    return this.studies.get(student.id, id);
  }

  @Put('materials/:id/study')
  save(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
    @Body(new ZodValidationPipe(studyChangeSchema)) body: StudyChange,
  ) {
    return this.studies.change(student.id, id, body);
  }

  @Post('materials/:id/study/history')
  history(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
    @Body(new ZodValidationPipe(studyHistorySchema))
    body: z.infer<typeof studyHistorySchema>,
  ) {
    return this.studies.history(student.id, id, body);
  }

  @Post('materials/:id/study/tutor')
  async tutor(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
    @Body(new ZodValidationPipe(studyQuestionSchema)) body: StudyQuestion,
    @Res() response: Response,
  ) {
    // Check ownership before starting the streaming response.
    await this.studies.get(student.id, id);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const controller = new AbortController();
    response.once('close', () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    });
    const emit = (event: unknown) => {
      if (!response.destroyed) {
        response.write(`${JSON.stringify(event)}\n`);
      }
    };
    try {
      await this.studies.tutor(student.id, id, body, emit, controller.signal);
    } catch (error) {
      emit({
        type: 'error',
        code: error instanceof PublicError ? error.code : 'TUTOR_UNAVAILABLE',
        message:
          error instanceof PublicError
            ? error.message
            : 'A explicação foi interrompida. Tente novamente.',
      });
    } finally {
      response.end();
    }
  }

  @Get('materials/:id/study/export')
  async export(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe()) id: string,
    @Query('revision', new ZodValidationPipe(z.coerce.number().int().min(0)))
    revision: number,
    @Res() response: Response,
  ) {
    const result = await this.studies.export(student.id, id, revision);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.title)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.end(Buffer.from(result.bytes));
  }
}
