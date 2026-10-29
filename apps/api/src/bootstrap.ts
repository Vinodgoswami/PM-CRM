import { type INestApplication } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { minorToJson } from '@salescrm/types';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/** Shared by main.ts and tests so both run the same middleware, prefix and error contract. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api/v1');
  // Production runs behind one reverse proxy (D-011); trust its X-Forwarded-For so per-IP login limits see the client.
  if (config.nodeEnv === 'production') (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  // Local document storage receives raw file bytes (any type); the 26 MB cap sits just above the 25 MB rule.
  // Only mounted for the local driver: with S3 the route is unused and must not buffer anonymous bodies.
  if (config.storage.driver === 'local') app.use('/api/v1/storage/local', express.raw({ type: () => true, limit: '26mb' }));
  app.useGlobalFilters(new AllExceptionsFilter());
  // Money is bigint minor units on the server (M-1); JSON carries it as a safe integer.
  const server = app.getHttpAdapter().getInstance() as Express;
  server.set('json replacer', (_key: string, value: unknown) => (typeof value === 'bigint' ? minorToJson(value) : value));
}
