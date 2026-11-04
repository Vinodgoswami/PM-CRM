import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FxModule } from '../fx/fx.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({ imports: [SettingsModule, FxModule], controllers: [ClientsController], providers: [ClientsService], exports: [ClientsService] })
export class ClientsModule {}
