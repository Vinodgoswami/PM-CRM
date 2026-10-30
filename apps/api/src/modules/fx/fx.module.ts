import { Module } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { APP_CONFIG } from '../../config.module';
import { SettingsModule } from '../settings/settings.module';
import { FxController } from './fx.controller';
import { FixedProvider, FrankfurterProvider, FX_PROVIDER, OffProvider } from './fx.providers';
import { FxService } from './fx.service';

@Module({
  imports: [SettingsModule],
  controllers: [FxController],
  providers: [
    FxService,
    {
      provide: FX_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.fx.provider === 'fixed' ? new FixedProvider() : config.fx.provider === 'off' ? new OffProvider() : new FrankfurterProvider(),
    },
  ],
  exports: [FxService],
})
export class FxModule {}
