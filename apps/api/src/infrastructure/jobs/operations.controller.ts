import { ResourceIdPipe } from '../http/resource-id.pipe.js';
import { SessionGuard } from '../../modules/auth/session.guard.js';
import { CurrentStudent } from '../../modules/auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../../modules/auth/entities/student.entity.js';
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readConfig } from '../config.js';
import { OperationRepository } from './operations.js';

@UseGuards(SessionGuard)
@Controller('api/v1/operations')
export class OperationsController {
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  @Get(':id')
  async get(
    @Param('id', new ResourceIdPipe('Operação não encontrada.')) id: string,
    @CurrentStudent() student: CurrentStudentEntity,
  ) {
    return this.operations.get(student.id, id);
  }

  @Post(':id/retry')
  @HttpCode(202)
  async retry(
    @Param('id', new ResourceIdPipe('Operação não encontrada.')) id: string,
    @Headers('idempotency-key') key: string,
    @CurrentStudent() student: CurrentStudentEntity,
  ) {
    await this.operations.retry(student.id, id, key);
    return this.operations.get(student.id, id);
  }

  @Get(':id/events')
  async events(
    @Param('id', new ResourceIdPipe('Operação não encontrada.')) id: string,
    @CurrentStudent() student: CurrentStudentEntity,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const operationId = id;
    await this.operations.get(student.id, operationId);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    const lastEventId = Number(request.header('last-event-id') ?? 0);
    let sequence =
      Number.isSafeInteger(lastEventId) && lastEventId >= 0 ? lastEventId : 0;
    let polling = false;
    const poll = async () => {
      if (polling || response.destroyed) {
        return;
      }
      polling = true;
      try {
        const operation = await this.operations.get(student.id, operationId);
        const events = await this.operations.events(
          student.id,
          operationId,
          sequence,
        );
        for (const event of events) {
          response.write(
            `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
          );
          sequence = event.sequence;
        }
        if (['completed', 'failed', 'cancelled'].includes(operation.state)) {
          response.end();
        }
      } catch {
        response.end();
      } finally {
        polling = false;
      }
    };
    const eventInterval = setInterval(() => void poll(), 1_000);
    const heartbeatInterval = setInterval(
      () => response.write(': heartbeat\n\n'),
      15_000,
    );
    response.once('close', () => {
      clearInterval(eventInterval);
      clearInterval(heartbeatInterval);
    });
    await poll();
  }
}
