import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
