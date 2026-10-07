import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import { openDisputeSchema } from './dto/open-dispute.dto.js';
import type { OpenDisputeDto } from './dto/open-dispute.dto.js';
import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DisputesService } from './disputes.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1')
export class GradingController {
  constructor(
    @Inject(DisputesService) private readonly disputes: DisputesService,
  ) {}

  @Get('answers/:id/grade-revisions')
  async revisions(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.'))
    answerId: string,
  ) {
    return this.disputes.revisions(student.id, answerId);
  }

  @Post('answers/:id/disputes')
  async open(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.'))
    answerId: string,
    @Body(
      new ZodValidationPipe(
        openDisputeSchema,
        'DISPUTE_INVALID',
        'Explique o motivo da contestação.',
      ),
    )
    body: OpenDisputeDto,
  ) {
    return this.disputes.open(student.id, answerId, body.reason);
  }

  @Post('disputes/:id/reevaluate')
  async reevaluate(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Recurso não encontrado.'))
    disputeId: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.disputes.reevaluate(student.id, disputeId, key);
  }
}
