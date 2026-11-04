import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FxModule } from '../fx/fx.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [SettingsModule, FxModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
