import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OperationsModule } from './infrastructure/jobs/operations.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { AttemptsModule } from './modules/attempts/attempts.module.js';
import { GradingModule } from './modules/grading/grading.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { PracticeModule } from './modules/insights/practice.module.js';

@Module({
  imports: [
    AuthModule,
    OperationsModule,
    ConversationsModule,
    ExamsModule,
    MaterialsModule,
    AttemptsModule,
    GradingModule,
    InsightsModule,
    PracticeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
