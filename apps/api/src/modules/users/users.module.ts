import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController, OwnersController], providers: [UsersService] })
export class UsersModule {}
