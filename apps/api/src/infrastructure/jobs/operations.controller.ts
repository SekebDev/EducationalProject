import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../../modules/auth/auth.service.js';
import { readConfig } from '../config.js';
import { getCookie } from '../http/cookies.js';
import { PublicError } from '../http/public-error.js';
import { OperationRepository } from './operations.js';

function validId(value: string): string {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
  }
  return value;
}

@Controller('api/v1/operations')
export class OperationsController {
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.operations.get(student.id, validId(id));
  }

  @Post(':id/retry')
  @HttpCode(202)
  async retry(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() request: Request,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    await this.operations.retry(student.id, validId(id), key);
    return this.operations.get(student.id, id);
  }

  @Get(':id/events')
  async events(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    const operationId = validId(id);
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
