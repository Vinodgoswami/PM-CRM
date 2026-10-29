import { type DynamicModule, Module } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config.module';
import { HealthController } from './modules/health/health.controller';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
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
    };
  }
}
