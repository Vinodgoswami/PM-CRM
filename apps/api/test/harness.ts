import { type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashPassword } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type PrismaClient, type User } from '@salescrm/database';
import { resetDatabase } from '@salescrm/database/testing';
import { type Role } from '@salescrm/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/modules/prisma/prisma.module';
import { testConfig } from './test-config';

export const TEST_PASSWORD = 'correct-horse-battery';

export async function createTestApp(
  overrides: Partial<AppConfig> = {},
  extraControllers: Type[] = [],
): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  const config = testConfig(overrides);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)], controllers: extraControllers }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export { resetDatabase };

let counter = 0;

export async function createUser(
  prisma: PrismaClient,
  opts: { role: Role; email?: string; password?: string; active?: boolean; name?: string },
): Promise<User> {
  counter += 1;
  return prisma.user.create({
    data: {
      name: opts.name ?? `${opts.role} user ${counter}`,
      email: opts.email ?? `${opts.role.toLowerCase()}${counter}@example.com`,
      role: opts.role,
      active: opts.active ?? true,
      passwordHash: await hashPassword(opts.password ?? TEST_PASSWORD),
    },
  });
}

export async function loginAs(
  app: INestApplication,
  prisma: PrismaClient,
  role: Role,
): Promise<{ agent: ReturnType<typeof request.agent>; user: User; csrf: string }> {
  const user = await createUser(prisma, { role });
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user, csrf: res.body.csrfToken as string };
}
