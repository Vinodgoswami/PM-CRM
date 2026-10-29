import { Controller, Get, Query } from '@nestjs/common';
import { type Dashboard, type DashboardQuery, dashboardQuerySchema } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.own')
  get(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(dashboardQuerySchema)) q: DashboardQuery): Promise<Dashboard> {
    return this.dashboard.get(user, q);
  }
}
