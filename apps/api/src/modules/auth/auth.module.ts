import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimit } from './rate-limit.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimit],
  exports: [AuthService],
})
export class AuthModule {}
