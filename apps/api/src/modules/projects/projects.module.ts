import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClientsModule } from '../clients/clients.module';
import { FxModule } from '../fx/fx.module';
import { SettingsModule } from '../settings/settings.module';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { RecurringCatchUp } from './recurring-catch-up.interceptor';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';

@Module({
  imports: [ClientsModule, SettingsModule, FxModule],
  controllers: [ProjectsController, MilestonesController, RecurringController],
  providers: [ProjectsService, MilestonesService, RecurringService, { provide: APP_INTERCEPTOR, useClass: RecurringCatchUp }],
  exports: [ProjectsService],
})
export class ProjectsModule {}
