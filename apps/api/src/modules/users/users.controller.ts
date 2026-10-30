import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
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
  list(@CurrentUser() actor: SessionUser): Promise<{ items: UserListItem[] }> {
    return this.users.list(actor);
  }

  @Get('invites')
  invites(@CurrentUser() actor: SessionUser) {
    return this.users.listInvites(actor);
  }

  @Post('invites/:id/resend')
  resend(@CurrentUser() actor: SessionUser, @Param('id') id: string): Promise<LinkResponse> {
    return this.users.resendInvite(actor, id);
  }

  @Delete('invites/:id')
  @HttpCode(204)
  cancel(@CurrentUser() actor: SessionUser, @Param('id') id: string): Promise<void> {
    return this.users.cancelInvite(actor, id);
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
