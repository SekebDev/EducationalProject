import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

export class PublicError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId =
      response.getHeader('X-Request-ID')?.toString() ?? 'unknown';
    const status =
      error instanceof PublicError
        ? error.status
        : error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const code =
      error instanceof PublicError
        ? error.code
        : status === 404
          ? 'NOT_FOUND'
          : 'REQUEST_FAILED';
    const message =
      error instanceof PublicError
        ? error.message
        : status === 500
          ? 'O serviço não conseguiu concluir a solicitação.'
          : 'Solicitação inválida.';
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Request-ID', requestId);
    response.status(status).json({
      error: {
        code,
        message,
        retryable: error instanceof PublicError && error.retryable,
        requestId,
      },
    });
  }
}
