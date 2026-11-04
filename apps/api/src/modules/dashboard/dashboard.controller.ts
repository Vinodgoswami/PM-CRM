import { Controller, Get, Query } from '@nestjs/common';
import { type Dashboard, type DashboardQuery, dashboardQuerySchema } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { DashboardService } from './dashboard.service';
import { FxService } from '../fx/fx.service';
import { SettingsService } from '../settings/settings.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly fx: FxService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @RequirePermission('dashboard.own')
  async get(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(dashboardQuerySchema)) q: DashboardQuery): Promise<Dashboard> {
    const to = user.displayCurrency;
    const base = (await this.settings.get()).baseCurrency;
    // D-036: the viewer's own currency at today's rate; without a rate the base figures are shown as they are.
    const rate = to && to !== base ? await this.fx.find(base, to) : null;
    if (!rate) return this.dashboard.get(user, q);
    const dash = await this.dashboard.get(user, q, { currency: to!, rate: rate.rate });
    return { ...dash, conversion: { from: base, to: to!, rate: rate.rate, date: rate.date } };
  }
}
