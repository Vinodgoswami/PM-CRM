import { Controller, Get, Query } from '@nestjs/common';
import { type Dashboard, type DashboardQuery, dashboardQuerySchema } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { DashboardService } from './dashboard.service';
import { SettingsService } from '../settings/settings.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @RequirePermission('dashboard.own')
  async get(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(dashboardQuerySchema)) q: DashboardQuery): Promise<Dashboard> {
    const to = user.displayCurrency;
    const [settings, today] = await Promise.all([this.settings.get(), this.settings.today()]);
    if (!to || to === settings.baseCurrency) return this.dashboard.get(user, q);
    // D-036 / D-039: the viewer's own currency; each project converts at its own starting rate.
    const dash = await this.dashboard.get(user, q, to);
    return { ...dash, conversion: { from: settings.baseCurrency, to, rate: '', date: today } };
  }
}
