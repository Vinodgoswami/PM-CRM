import { Body, Controller, Param, Post } from '@nestjs/common';
import { type CreateRecurringInput, createRecurringSchema, extendRecurringSchema, type ProjectDetail } from '@salescrm/schemas';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { RecurringService } from './recurring.service';

/** D-063: monthly recurring milestones. */
@Controller()
@RequirePermission('projects.write')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Post('projects/:id/recurring')
  create(
    @CurrentUser() user: SessionUser,
    @Param('id') projectId: string,
    @Body(new ZodValidationPipe(createRecurringSchema)) body: CreateRecurringInput,
  ): Promise<ProjectDetail> {
    return this.recurring.create(user, projectId, body);
  }

  @Post('recurring/:id/extend')
  extend(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendRecurringSchema)) body: z.infer<typeof extendRecurringSchema>,
  ): Promise<ProjectDetail> {
    return this.recurring.extend(user, id, body.months);
  }

  @Post('recurring/:id/stop')
  stop(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ProjectDetail> {
    return this.recurring.stop(user, id);
  }
}
