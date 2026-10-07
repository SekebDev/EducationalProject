import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PublicError } from '../../infrastructure/http/public-error.js';
import type { CurrentStudentEntity } from './entities/student.entity.js';
import type { AuthenticatedRequest } from './session.guard.js';

export const CurrentStudent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentStudentEntity => {
    const student = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().student;
    if (!student) {
      throw new PublicError(401, 'UNAUTHENTICATED', 'Entre para continuar.');
    }
    return student;
  },
);
