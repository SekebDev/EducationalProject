import { UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1/insights')
export class InsightsController {
  constructor(
    @Inject(RecommendationsService)
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get()
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Query('topicId') topicId?: string,
    @Query('level') level?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('timezone') timezone?: string,
  ) {
    return this.recommendations.list(student.id, {
      topicId,
      level,
      from,
      to,
      timezone,
    });
  }
}
