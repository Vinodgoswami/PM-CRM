import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({ imports: [SettingsModule], controllers: [ClientsController], providers: [ClientsService], exports: [ClientsService] })
export class ClientsModule {}
