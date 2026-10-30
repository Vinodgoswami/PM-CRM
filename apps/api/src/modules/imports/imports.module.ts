import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { FxModule } from '../fx/fx.module';
import { SettingsModule } from '../settings/settings.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({ imports: [ClientsModule, SettingsModule, FxModule], controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
