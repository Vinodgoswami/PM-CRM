import { type INestApplication } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { minorToJson } from '@salescrm/types';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/** Shared by main.ts and tests so both run the same middleware, prefix and error contract. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api/v1');
  // Production runs behind one reverse proxy (D-011); trust its X-Forwarded-For so per-IP login limits see the client.
  if (config.nodeEnv === 'production') (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  // The page uploads to and shows files from the storage bucket directly (signed URLs), so its origin is allowed.
  const bucket = config.storage.driver === 's3' && config.storage.endpoint ? [new URL(config.storage.endpoint).origin] : [];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'connect-src': ["'self'", ...bucket],
          'img-src': ["'self'", 'data:', 'blob:', ...bucket],
        },
      },
    }),
  );
  app.use(cookieParser());
  // Local document storage receives raw file bytes (any type); the 26 MB cap sits just above the 25 MB rule.
  // Only mounted for the local driver: with S3 the route is unused and must not buffer anonymous bodies.
  if (config.storage.driver === 'local') app.use('/api/v1/storage/local', express.raw({ type: () => true, limit: '26mb' }));
  // CSV imports carry the file as JSON text; allow up to the 5 MB the schema accepts (default is 100 kB).
  // Wrapped so Nest still registers its own default parser (it skips that when it sees a bare jsonParser).
  const importJson = express.json({ limit: '6mb' });
  app.use('/api/v1/imports', (req: Request, res: Response, next: NextFunction) => importJson(req, res, next));
  app.useGlobalFilters(new AllExceptionsFilter());
  // Money is bigint minor units on the server (M-1); JSON carries it as a safe integer.
  const server = app.getHttpAdapter().getInstance() as Express;
  server.set('json replacer', (_key: string, value: unknown) => (typeof value === 'bigint' ? minorToJson(value) : value));
  if (config.webDistDir) serveWeb(app, path.resolve(config.webDistDir));
}

/** One-host deployment: hashed assets cached for a year, every other non-API page address gets index.html. */
function serveWeb(app: INestApplication, dir: string): void {
  app.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(dir, { index: false, maxAge: '1h' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
}
