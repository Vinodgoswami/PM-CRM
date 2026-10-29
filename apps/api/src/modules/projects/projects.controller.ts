import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  changeOwnerSchema,
  changeStatusSchema,
  type CreateProjectInput,
  createProjectSchema,
  type ProjectDetail,
  type ProjectListQuery,
  projectListQuerySchema,
  type UpdateProjectInput,
  updateProjectSchema,
} from '@salescrm/schemas';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('projects.read')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery) {
    return this.projects.list(user, query);
  }

  @Post()
  @RequirePermission('projects.write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ): Promise<ProjectDetail> {
    return this.projects.create(user, body);
  }

  @Get(':id')
  @RequirePermission('projects.read')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ProjectDetail> {
    return this.projects.get(id, user);
  }

  @Patch(':id')
  @RequirePermission('projects.write')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<ProjectDetail> {
    return this.projects.update(user, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('projects.write')
  status(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: z.infer<typeof changeStatusSchema>,
  ): Promise<ProjectDetail> {
    return this.projects.changeStatus(user, id, body.status);
  }

  @Patch(':id/owner')
  @RequirePermission('projects.reassign')
  owner(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeOwnerSchema)) body: z.infer<typeof changeOwnerSchema>,
  ): Promise<ProjectDetail> {
    return this.projects.changeOwner(user, id, body.ownerId);
  }
}
