import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { SettingsModule } from '../settings/settings.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ClientsModule, SettingsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
