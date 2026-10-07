import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { AuthService } from './auth.service.js';
import type { CurrentStudentEntity } from './entities/student.entity.js';

export type AuthenticatedRequest = Request & { student?: CurrentStudentEntity };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return true;
  }
}
