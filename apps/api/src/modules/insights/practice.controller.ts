import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import { practiceSchema } from './dto/create-practice.dto.js';
import type { CreatePracticeDto } from './dto/create-practice.dto.js';
import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PracticeService } from './practice.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1/recommendations')
export class PracticeController {
  constructor(
    @Inject(PracticeService) private readonly practice: PracticeService,
  ) {}

  @Get(':id')
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recomendação não encontrada.')) id: string,
  ) {
    return this.practice.get(student.id, id);
  }

  @Post(':id/practice')
  @HttpCode(202)
  async create(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recomendação não encontrada.')) id: string,
    @Headers('idempotency-key') key: string,
    @Body(
      new ZodValidationPipe(
        practiceSchema,
        'INVALID_PRACTICE',
        'Confira a configuração da prática.',
      ),
    )
    body: CreatePracticeDto,
  ) {
    return this.practice.create(student.id, id, key, body);
  }
}
