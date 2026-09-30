import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { RecommendationsService } from './recommendations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InsightsController],
  providers: [InsightsService, RecommendationsService],
  exports: [RecommendationsService],
})
export class InsightsModule {}
