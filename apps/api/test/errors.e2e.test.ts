import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common';
import { Prisma } from '@salescrm/database';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { z } from 'zod';
import { configureApp } from '../src/bootstrap';
import { RuleViolation } from '../src/common/errors';
import { ZodValidationPipe } from '../src/common/zod.pipe';
import { testConfig } from './test-config';

@Controller('test-errors')
class ErrorsTestController {
  @Get('rule')
  rule(): never {
    throw new RuleViolation('P-2', 'Amount exceeds balance');
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(z.object({ name: z.string() }))) body: { name: string }) {
    return body;
  }

  @Get('bigint')
  bigint() {
    return { amountMinor: 125000n };
  }

  @Get('db')
  db(): never {
    throw new Prisma.PrismaClientKnownRequestError('Transaction already closed: secret detail', { code: 'P2028', clientVersion: 'test' });
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom');
  }
}

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ controllers: [ErrorsTestController] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, testConfig());
  await app.init();
});

afterAll(async () => {
  await app.close();
});

test('rule violations carry the rule id', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/test-errors/rule');
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: { code: 'VALIDATION_FAILED', message: 'Amount exceeds balance', details: { rule: 'P-2' } } });
});

test('zod validation failures list the field path', async () => {
  const res = await request(app.getHttpServer()).post('/api/v1/test-errors/validate').send({});
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(res.body.error.details[0].path).toEqual(['name']);
});

test('unknown routes return NOT_FOUND', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/nope');
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
});

test('bigint amounts serialise as JSON integers', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/test-errors/bigint');
  expect(res.text).toBe('{"amountMinor":125000}');
});

test('unexpected errors hide their message', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/test-errors/boom');
  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe('INTERNAL');
  expect(JSON.stringify(res.body)).not.toContain('boom');
  // A short reference ties the message the user sees to the logged stack trace.
  expect(res.body.error.message).toMatch(/^Something went wrong \(ref [0-9a-f]{8}\)$/);
});

test('a database error shows its code (never its message) beside the reference', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/test-errors/db');
  expect(res.status).toBe(500);
  expect(res.body.error.message).toMatch(/^Something went wrong \(ref [0-9a-f]{8}, P2028\)$/);
  expect(JSON.stringify(res.body)).not.toContain('secret');
});
