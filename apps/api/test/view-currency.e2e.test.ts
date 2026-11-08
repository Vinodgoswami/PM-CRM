import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@salescrm/database';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, loginAs, resetDatabase } from './harness';

// D-067: amounts are shown in the viewer's currency, US dollars unless they chose another. Fixed test rate: 1 INR = 0.012 USD.
let app: INestApplication;
let prisma: PrismaClient;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp({ defaultViewCurrency: 'USD' }));
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.setting.upsert({ where: { id: 1 }, update: { baseCurrency: 'INR' }, create: { id: 1, baseCurrency: 'INR' } });
});
afterAll(async () => {
  await app.close();
});

test('projects carry their rate into the view currency: US dollars by default, the chosen one otherwise', async () => {
  const { agent, csrf, user } = await loginAs(app, prisma, 'SALES');
  const p = await agent
    .post('/api/v1/projects')
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Shunya', expectedAmountMinor: 10000000, currency: 'INR', status: 'ACTIVE', newClient: { name: 'Vishal' } });
  expect(p.status).toBe(201);
  expect(p.body.view).toEqual({ currency: 'USD', rate: '0.012' });
  const list = (await agent.get('/api/v1/projects')).body.items;
  expect(list[0].view).toEqual({ currency: 'USD', rate: '0.012' });
  expect((await agent.get('/api/v1/dashboard?period=THIS_FY')).body.currency).toBe('USD');

  await prisma.user.update({ where: { id: user.id }, data: { displayCurrency: 'INR' } });
  expect((await agent.get(`/api/v1/projects/${p.body.id}`)).body.view).toEqual({ currency: 'INR', rate: '1' });
  expect((await agent.get('/api/v1/dashboard?period=THIS_FY')).body.currency).toBe('INR');
  expect((await agent.get('/api/v1/invoices')).body.currency).toBe('INR');
});
