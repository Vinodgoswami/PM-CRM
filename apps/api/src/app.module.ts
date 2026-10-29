import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { type AppConfig } from '@salescrm/config';
import { LoggerModule } from 'nestjs-pino';
import { CsrfGuard } from './common/csrf.guard';
import { PermissionGuard } from './common/permission.guard';
import { SessionGuard } from './common/session.guard';
import { ConfigModule } from './config.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthController } from './modules/health/health.controller';
import { PaymentsModule } from './modules/payments/payments.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        PrismaModule,
        AuthModule,
        AuditModule,
        SettingsModule,
        UsersModule,
        ClientsModule,
        ProjectsModule,
        StorageModule,
        DocumentsModule,
        PaymentsModule,
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
      // Order matters: session (sets req.user) → CSRF → permission (default-deny).
      providers: [
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    };
  }
}
