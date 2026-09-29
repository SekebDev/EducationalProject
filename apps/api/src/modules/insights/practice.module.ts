import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { InsightsModule } from './insights.module.js';
import { PracticeController } from './practice.controller.js';
import { PracticeService } from './practice.service.js';

@Module({
  imports: [AuthModule, ExamsModule, InsightsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
