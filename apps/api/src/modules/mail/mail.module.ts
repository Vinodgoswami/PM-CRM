import { Global, Module } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { APP_CONFIG } from '../../config.module';
import { MailService } from './mail.service';
import { MAILER, mailerFor } from './mailer';

@Global()
@Module({
  providers: [MailService, { provide: MAILER, inject: [APP_CONFIG], useFactory: (config: AppConfig) => mailerFor(config.email) }],
  exports: [MailService, MAILER],
})
export class MailModule {}
