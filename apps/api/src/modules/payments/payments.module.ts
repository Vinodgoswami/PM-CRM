import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { ProjectsModule } from '../projects/projects.module';
import { SettingsModule } from '../settings/settings.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InvoicesService } from './invoices.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ProjectsModule, SettingsModule, FxModule],
  controllers: [PaymentsController, BillingController],
  providers: [PaymentsService, BillingService, InvoicesService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
