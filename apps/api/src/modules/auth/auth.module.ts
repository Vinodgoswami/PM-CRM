import { Global, Module } from '@nestjs/common';
import { AuthTokensService } from './auth-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuthTokensService],
  exports: [AuthService, SessionService, AuthTokensService],
})
export class AuthModule {}
