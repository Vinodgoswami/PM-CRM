import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { testConfig } from './test-config';

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(testConfig())] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, testConfig());
  await app.init();
});

afterAll(async () => {
  await app.close();
});

test('GET /api/v1/health reports ok', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});
