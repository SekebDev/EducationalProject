import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { RecommendationsService } from './recommendations.service.js';

@Controller('api/v1/insights')
export class InsightsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RecommendationsService)
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get()
  async get(
    @Req() request: Request,
    @Query('topicId') topicId?: string,
    @Query('level') level?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('timezone') timezone?: string,
  ) {
    const student = await this.auth.currentStudent(
      getCookie(request, 'study_session'),
    );
    return this.recommendations.list(student.id, {
      topicId,
      level,
      from,
      to,
      timezone,
    });
  }
}
