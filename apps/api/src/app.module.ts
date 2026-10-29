import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { type AppConfig } from '@salescrm/config';
import { LoggerModule } from 'nestjs-pino';
import { CsrfGuard } from './common/csrf.guard';
import { SessionGuard } from './common/session.guard';
import { ConfigModule } from './config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { PrismaModule } from './modules/prisma/prisma.module';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        PrismaModule,
        AuthModule,
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            // Secrets and personal data never reach logs (docs/11).
            redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'req.body.password', 'res.headers["set-cookie"]'],
            ...(config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
        }),
      ],
      controllers: [HealthController],
      // Order matters: session first (sets req.user), then CSRF.
      providers: [
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    };
  }
}
