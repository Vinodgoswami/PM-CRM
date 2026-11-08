import { Inject, Injectable } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { changedFields, type IsoDate, todayIn } from '@salescrm/core';
import { Prisma } from '@salescrm/database';
import { type Settings, type UpdateSettingsInput } from '@salescrm/schemas';
import { type SessionUser } from '../../common/current-user';
import { AuditService } from '../audit/audit.service';
import { can } from '@salescrm/auth/permissions';
import { forbidden } from '../../common/errors';
import { PrismaService } from '../prisma/prisma.module';
import { APP_CONFIG } from '../../config.module';

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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** D-067: the currency this viewer sees amounts in: their own choice, else the app default (US dollars), else the company's. */
  async viewCurrency(user: { displayCurrency?: string | null } | undefined): Promise<string> {
    return user?.displayCurrency ?? this.config.defaultViewCurrency ?? (await this.get()).baseCurrency;
  }

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

  /** What GET /settings shows: the settings plus the app's default view currency (D-067). */
  async forDisplay(): Promise<Settings> {
    return { ...(await this.get()), defaultViewCurrency: this.config.defaultViewCurrency ?? null };
  }

  /** "Today" in the company timezone: the reference date for due / overdue / outstanding (docs/04 § Time). */
  async today(now: Date = new Date()): Promise<IsoDate> {
    return todayIn((await this.load()).timezone, now);
  }

  async update(user: SessionUser, input: UpdateSettingsInput): Promise<Settings> {
    // D-021: the Admin may only rename the company; currency, financial year and the rest are the CEO's.
    if (!can(user, 'settings.manage') && Object.keys(input).some((k) => k !== 'companyName')) {
      throw forbidden('Only the CEO can change the currency, financial year, time zone or due-soon days.');
    }
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
