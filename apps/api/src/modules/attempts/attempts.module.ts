import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttemptsController } from './attempts.controller.js';
import { AttemptsService } from './attempts.service.js';
import { SubmissionService } from './submission.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, SubmissionService],
})
export class AttemptsModule {}
