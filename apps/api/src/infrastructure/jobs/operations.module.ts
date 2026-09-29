import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module.js';
import { OperationsController } from './operations.controller.js';

@Module({ imports: [AuthModule], controllers: [OperationsController] })
export class OperationsModule {}
