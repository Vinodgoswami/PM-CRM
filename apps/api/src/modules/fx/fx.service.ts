import { Inject, Injectable } from '@nestjs/common';
import { type IsoDate } from '@salescrm/core';
import { type FxRateDto } from '@salescrm/schemas';
import { AppError } from '../../common/errors';
import { PrismaService } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';
import { FX_PROVIDER, type FxProvider } from './fx.providers';

/** Daily exchange rates (D-020), fetched once per (date, pair) and cached in FxRate. */
@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(FX_PROVIDER) private readonly provider: FxProvider,
  ) {}

  /** The rate, or null when none is available (offline, unknown pair, provider off). */
  async find(from: string, to: string, date?: IsoDate): Promise<FxRateDto | null> {
    const today = await this.settings.today();
    const day = !date || date > today ? today : date; // no rates for the future: use today's
    if (from === to) return { from, to, rate: '1', date: day, source: 'same' };
    const at = new Date(`${day}T00:00:00Z`);
    const cached = await this.prisma.fxRate.findUnique({ where: { date_from_to: { date: at, from, to } } });
    if (cached) return { from, to, rate: cached.rate.toString(), date: day, source: cached.source };
    const rate = await this.provider.rate(from, to, day);
    if (!rate) return null;
    await this.prisma.fxRate.upsert({
      where: { date_from_to: { date: at, from, to } },
      update: {},
      create: { date: at, from, to, rate, source: this.provider.name },
    });
    return { from, to, rate, date: day, source: this.provider.name };
  }

  /**
   * D-039: for each project without a saved rate into `to`, the rate of the day it was created; projects in `to`
   * itself or with no rate available are left out of the map.
   */
  async startRates(projects: { id: string; currency: string; createdAt: Date }[], to: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const byKey = new Map<string, Promise<FxRateDto | null>>();
    for (const p of projects) {
      if (p.currency === to) continue;
      const day = p.createdAt.toISOString().slice(0, 10);
      const key = `${p.currency}>${day}`;
      if (!byKey.has(key)) byKey.set(key, this.find(p.currency, to, day));
      const found = await byKey.get(key)!;
      if (found) out.set(p.id, found.rate);
    }
    return out;
  }

  /** Like find, but a missing rate is a 400 telling the user to type it in. */
  async get(from: string, to: string, date?: IsoDate): Promise<FxRateDto> {
    const found = await this.find(from, to, date);
    if (found) return found;
    const day = date ?? (await this.settings.today());
    throw new AppError(400, 'VALIDATION_FAILED', `No exchange rate is available for ${from} → ${to} on ${day}. Enter the rate yourself.`);
  }
}
