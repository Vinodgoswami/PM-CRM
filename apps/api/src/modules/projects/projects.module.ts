import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { FxModule } from '../fx/fx.module';
import { SettingsModule } from '../settings/settings.module';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ClientsModule, SettingsModule, FxModule],
  controllers: [ProjectsController, MilestonesController],
  providers: [ProjectsService, MilestonesService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
