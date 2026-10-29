import { Global, Module } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { APP_CONFIG } from '../../config.module';
import { LocalDriver } from './local.driver';
import { LocalStorageController } from './local-storage.controller';
import { S3Driver } from './s3.driver';
import { STORAGE_DRIVER } from './storage.driver';

@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.storage.driver === 's3' ? new S3Driver(config.storage) : new LocalDriver(config.storage.localDir, config.sessionSecret),
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
