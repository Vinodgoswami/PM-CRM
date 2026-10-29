import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { type DocumentDto, type RequestUploadInput, requestUploadSchema, type UploadSlot } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('projects/:id/documents/upload-url')
  @RequirePermission('projects.write')
  requestUpload(
    @CurrentUser() user: SessionUser,
    @Param('id') projectId: string,
    @Body(new ZodValidationPipe(requestUploadSchema)) body: RequestUploadInput,
  ): Promise<UploadSlot> {
    return this.documents.requestUpload(user, projectId, body);
  }

  @Post('documents/:id/confirm')
  @HttpCode(200)
  @RequirePermission('projects.write')
  confirm(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<DocumentDto> {
    return this.documents.confirm(user, id);
  }

  @Get('projects/:id/documents')
  @RequirePermission('projects.read')
  list(@CurrentUser() user: SessionUser, @Param('id') projectId: string): Promise<{ items: DocumentDto[] }> {
    return this.documents.list(user, projectId);
  }

  @Get('documents/:id/download')
  @RequirePermission('projects.read')
  download(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<{ url: string }> {
    return this.documents.download(user, id);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  @RequirePermission('projects.write')
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.documents.remove(user, id);
  }
}
