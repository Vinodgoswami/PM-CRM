import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type InviteUserInput,
  inviteUserSchema,
  type LinkResponse,
  type UpdateUserInput,
  updateUserSchema,
  type UserListItem,
} from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<{ items: UserListItem[] }> {
    return this.users.list();
  }

  @Post('invite')
  invite(@CurrentUser() actor: SessionUser, @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput): Promise<LinkResponse> {
    return this.users.invite(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<UserListItem> {
    return this.users.update(actor, id, body);
  }

  @Post(':id/reset-link')
  resetLink(@CurrentUser() actor: SessionUser, @Param('id') id: string): Promise<LinkResponse> {
    return this.users.resetLink(actor, id);
  }
}
