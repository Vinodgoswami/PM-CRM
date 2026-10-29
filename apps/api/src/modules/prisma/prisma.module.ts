import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { PrismaClient } from '@salescrm/database';
import { APP_CONFIG } from '../../config.module';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
