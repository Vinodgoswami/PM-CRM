import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SettingsModule } from '../settings/settings.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ProjectsModule, SettingsModule],
  controllers: [PaymentsController, BillingController],
  providers: [PaymentsService, BillingService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
