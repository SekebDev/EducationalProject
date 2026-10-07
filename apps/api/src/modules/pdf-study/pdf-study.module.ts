import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PdfStudyController } from './pdf-study.controller.js';
import { PdfStudyService } from './pdf-study.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PdfStudyController],
  providers: [PdfStudyService],
})
export class PdfStudyModule {}
