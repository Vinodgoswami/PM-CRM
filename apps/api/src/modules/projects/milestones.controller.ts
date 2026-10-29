import { Body, Controller, Delete, Param, Patch, Post, Put } from '@nestjs/common';
import {
  type MilestoneInput,
  milestoneInputSchema,
  type ProjectDetail,
  reorderMilestonesSchema,
  type UpdateMilestoneInput,
  updateMilestoneSchema,
} from '@salescrm/schemas';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { MilestonesService } from './milestones.service';

@Controller()
@RequirePermission('projects.write')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Post('projects/:id/milestones')
  create(
    @CurrentUser() user: SessionUser,
    @Param('id') projectId: string,
    @Body(new ZodValidationPipe(milestoneInputSchema)) body: MilestoneInput,
  ): Promise<ProjectDetail> {
    return this.milestones.create(user, projectId, body);
  }

  @Patch('milestones/:id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema)) body: UpdateMilestoneInput,
  ): Promise<ProjectDetail> {
    return this.milestones.update(user, id, body);
  }

  @Delete('milestones/:id')
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ProjectDetail> {
    return this.milestones.remove(user, id);
  }

  @Put('projects/:id/milestones/order')
  reorder(
    @CurrentUser() user: SessionUser,
    @Param('id') projectId: string,
    @Body(new ZodValidationPipe(reorderMilestonesSchema)) body: z.infer<typeof reorderMilestonesSchema>,
  ): Promise<ProjectDetail> {
    return this.milestones.reorder(user, projectId, body.ids);
  }
}
