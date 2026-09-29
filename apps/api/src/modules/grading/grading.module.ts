import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GradingController } from './grading.controller.js';
import { DisputesService } from './disputes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GradingController],
  providers: [DisputesService],
})
export class GradingModule {}
