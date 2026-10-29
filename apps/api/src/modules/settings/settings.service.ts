import { Injectable } from '@nestjs/common';
import { changedFields, type IsoDate, todayIn } from '@salescrm/core';
import { Prisma } from '@salescrm/database';
import { type Settings, type UpdateSettingsInput } from '@salescrm/schemas';
import { type SessionUser } from '../../common/current-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';

const SETTINGS_ID = 1;

function toDto(row: Settings): Settings {
  return {
    companyName: row.companyName,
    baseCurrency: row.baseCurrency,
    fyStartMonth: row.fyStartMonth,
    timezone: row.timezone,
    dueSoonDays: row.dueSoonDays,
  };
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The single settings row, created with the schema defaults on first read. */
  private async load(tx: Prisma.TransactionClient = this.prisma): Promise<Settings> {
    try {
      return await tx.setting.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
    } catch (e) {
      // Two first-ever reads can race to create the row; the loser simply reads the winner's row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return tx.setting.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
      }
      throw e;
    }
  }

  async get(): Promise<Settings> {
    return toDto(await this.load());
  }

  /** "Today" in the company timezone: the reference date for due / overdue / outstanding (docs/04 § Time). */
  async today(now: Date = new Date()): Promise<IsoDate> {
    return todayIn((await this.load()).timezone, now);
  }

  async update(user: SessionUser, input: UpdateSettingsInput): Promise<Settings> {
    return this.prisma.$transaction(async (tx) => {
      const before = toDto(await this.load(tx));
      const after = toDto(await tx.setting.update({ where: { id: SETTINGS_ID }, data: input }));
      const diff = changedFields(before, after);
      if (diff) {
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'settings.update',
          entity: 'Setting',
          entityId: String(SETTINGS_ID),
          ...diff,
        });
      }
      return after;
    });
  }
}
