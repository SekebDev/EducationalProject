import { SessionGuard } from './session.guard.js';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimit } from './rate-limit.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimit, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
