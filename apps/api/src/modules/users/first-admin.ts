import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { hashPassword } from '@salescrm/auth';
import { type AppConfig } from '@salescrm/config';
import { type PrismaClient } from '@salescrm/database';
import { emailSchema, passwordSchema } from '@salescrm/schemas';
import { APP_CONFIG } from '../../config.module';
import { PrismaService } from '../prisma/prisma.module';

/** Creates the very first Admin of an empty database. Refuses when an Admin already exists. */
export async function createFirstAdmin(
  prisma: PrismaClient,
  input: { email: string; name: string; password: string },
): Promise<{ id: string; email: string }> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new Error(email.error.issues[0]!.message);
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) throw new Error(password.error.issues[0]!.message);
  const name = input.name.trim();
  if (!name) throw new Error('Enter a name');
  if ((await prisma.user.count({ where: { role: 'ADMIN' } })) > 0) {
    throw new Error('This database already has an Admin. Sign in, or ask them for a reset link.');
  }
  const user = await prisma.user.create({
    data: { email: email.data, name, role: 'ADMIN', passwordHash: await hashPassword(password.data) },
  });
  return { id: user.id, email: user.email };
}

/** D-033: on hosts without a shell (Render free), ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD create the first Admin once. */
@Injectable()
export class FirstAdminOnStartup implements OnApplicationBootstrap {
  private readonly log = new Logger('FirstAdmin');
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const input = this.config.firstAdmin;
    if (!input) return;
    if ((await this.prisma.user.count({ where: { role: 'ADMIN' } })) > 0) {
      this.log.log('An Admin already exists; ADMIN_* settings are ignored. Remove ADMIN_PASSWORD from the environment.');
      return;
    }
    try {
      const admin = await createFirstAdmin(this.prisma, input);
      this.log.warn(`Created the first Admin ${admin.email}. Sign in, then remove ADMIN_PASSWORD from the environment.`);
    } catch (e) {
      this.log.error(`Could not create the first Admin: ${(e as Error).message}`);
    }
  }
}
