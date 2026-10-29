import { Controller, Get, Header, Query } from '@nestjs/common';
import { type BillingPage, type BillingQuery, billingQuerySchema, type InvoicesResponse, invoicesQuerySchema } from '@salescrm/schemas';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { BillingService } from './billing.service';
import { InvoicesService } from './invoices.service';

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('invoices')
  @RequirePermission('invoices.read')
  upcoming(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(invoicesQuerySchema)) q: z.infer<typeof invoicesQuerySchema>,
  ): Promise<InvoicesResponse> {
    return this.invoices.list(user, q);
  }

  @Get('payments')
  @RequirePermission('billing.read')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(billingQuerySchema)) q: BillingQuery): Promise<BillingPage> {
    return this.billing.list(user, q);
  }

  @Get('exports/csv/billing')
  @RequirePermission('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="completed-billing.csv"')
  csv(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(billingQuerySchema)) q: BillingQuery): Promise<string> {
    return this.billing.csv(user, q);
  }
}
