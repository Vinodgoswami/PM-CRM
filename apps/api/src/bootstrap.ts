import { type INestApplication } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { minorToJson } from '@salescrm/types';
import cookieParser from 'cookie-parser';
import { type Express } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/** Shared by main.ts and tests so both run the same middleware, prefix and error contract. */
export function configureApp(app: INestApplication, _config: AppConfig): void {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // Money is bigint minor units on the server (M-1); JSON carries it as a safe integer.
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('json replacer', (_key: string, value: unknown) => (typeof value === 'bigint' ? minorToJson(value) : value));
}
