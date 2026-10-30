import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { SettingsModule } from '../settings/settings.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({ imports: [ClientsModule, SettingsModule], controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
