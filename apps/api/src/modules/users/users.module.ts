import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { OwnersController } from './owners.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { FirstAdminOnStartup } from './first-admin';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [UsersController, OwnersController, MeController],
  providers: [UsersService, FirstAdminOnStartup],
})
export class UsersModule {}
