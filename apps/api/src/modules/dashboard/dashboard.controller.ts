import { Controller, Get, Query } from '@nestjs/common';
import { type Dashboard, type DashboardQuery, dashboardQuerySchema } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { DashboardService } from './dashboard.service';
import { convertMoneyFields } from './display-currency';
import { FxService } from '../fx/fx.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly fx: FxService,
  ) {}

  @Get()
  @RequirePermission('dashboard.own')
  async get(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(dashboardQuerySchema)) q: DashboardQuery): Promise<Dashboard> {
    const dash = await this.dashboard.get(user, q);
    const to = user.displayCurrency;
    if (!to || to === dash.currency) return { ...dash, conversion: null };
    // D-036: shown in the viewer's own currency at today's rate; without a rate the base figures stay as they are.
    const rate = await this.fx.find(dash.currency, to);
    if (!rate) return { ...dash, conversion: null };
    const converted = convertMoneyFields(dash, rate.rate, dash.currency, to);
    return { ...converted, currency: to, conversion: { from: dash.currency, to, rate: rate.rate, date: rate.date } };
  }
}
