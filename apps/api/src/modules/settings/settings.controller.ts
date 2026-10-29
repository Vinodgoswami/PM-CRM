import { Body, Controller, Get, Patch } from '@nestjs/common';
import { type Settings, type UpdateSettingsInput, updateSettingsSchema } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { Authenticated, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Authenticated()
  get(): Promise<Settings> {
    return this.settings.get();
  }

  @Patch()
  @RequirePermission('settings.manage')
  update(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<Settings> {
    return this.settings.update(user, body);
  }
}
