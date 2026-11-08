import 'reflect-metadata';
import path from 'node:path';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigError, loadConfig } from '@salescrm/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { startKeepAwake } from './keep-awake';

async function bootstrap() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
  } catch {
    /* no .env: rely on the real environment */
  }
  let config;
  try {
    config = loadConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  const app = await NestFactory.create(AppModule.register(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, config);
  await app.listen(config.port);
  if (config.keepAwake) {
    const log = new NestLogger('KeepAwake');
    startKeepAwake(config.keepAwake, fetch, (m) => log.warn(m));
    log.log(`Pinging ${config.keepAwake.url} every ${config.keepAwake.everyMs / 60_000} minutes`);
  }
}

void bootstrap();
