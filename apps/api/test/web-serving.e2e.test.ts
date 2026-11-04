import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestApp } from './harness';

// Deployment on one host: the API also serves the built website, so the session cookie stays first-party (D-011).
let app: INestApplication;
const dist = mkdtempSync(path.join(os.tmpdir(), 'pmcrm-web-'));
mkdirSync(path.join(dist, 'assets'));
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>PM CRM</title>');
writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');

beforeAll(async () => {
  ({ app } = await createTestApp({
    webDistDir: dist,
    storage: {
      driver: 's3',
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      bucket: 'b',
      region: 'auto',
      accessKeyId: 'k',
      secretAccessKey: 's',
    },
  }));
});
afterAll(async () => {
  await app.close();
});
const http = () => request(app.getHttpServer());

test('page addresses get the app, assets are cached for a year, the API still answers as JSON', async () => {
  const page = await http().get('/projects/p1').set('Accept', 'text/html');
  expect(page.status).toBe(200);
  expect(page.text).toContain('<title>PM CRM</title>');
  expect(page.headers['cache-control']).toBe('no-cache');

  const asset = await http().get('/assets/app-abc123.js');
  expect(asset.status).toBe(200);
  expect(asset.headers['cache-control']).toContain('immutable');

  const api = await http().get('/api/v1/health');
  expect(api.body).toEqual({ status: 'ok' });
  const missing = await http().get('/api/v1/nope').set('Accept', 'text/html');
  expect(missing.status).toBe(404);
  expect(missing.headers['content-type']).toContain('application/json');
});

test('the page may upload to and show files from the storage bucket, and nothing else', async () => {
  const csp = (await http().get('/').set('Accept', 'text/html')).headers['content-security-policy'] as string;
  expect(csp).toMatch(/connect-src 'self' https:\/\/acct\.r2\.cloudflarestorage\.com/);
  expect(csp).toMatch(/img-src 'self' data: blob: https:\/\/acct\.r2\.cloudflarestorage\.com/);
});
