import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import { rawSchema } from './dto/create-exam.dto.js';
import type { CreateExamDto } from './dto/create-exam.dto.js';
import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
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
  UseGuards,
} from '@nestjs/common';
import { ExamsService } from './exams.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1/exams')
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly exams: ExamsService) {}

  @Post()
  @HttpCode(202)
  async create(
    @CurrentStudent() student: CurrentStudentEntity,
    @Headers('idempotency-key') key: string,
    @Body(
      new ZodValidationPipe(
        rawSchema,
        'INVALID_EXAM_CONFIG',
        'Confira a configuração da prova.',
      ),
    )
    body: CreateExamDto,
  ) {
    return this.exams.create(student.id, key, body);
  }

  @Get()
  async list(@CurrentStudent() student: CurrentStudentEntity) {
    return this.exams.list(student.id);
  }

  @Get(':id')
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Prova não encontrada.')) id: string,
  ) {
    return this.exams.get(student.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Prova não encontrada.')) id: string,
  ): Promise<void> {
    await this.exams.delete(student.id, id);
  }
}
