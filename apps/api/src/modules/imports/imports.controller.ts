import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { type ImportPreview, type ImportRequest, importRequestSchema, type ImportResult } from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { ImportsService } from './imports.service';

/** Admin-only CSV import (P6-4): preview first, then import the same file. */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('settings.manage')
  preview(@Body(new ZodValidationPipe(importRequestSchema)) body: ImportRequest): Promise<ImportPreview> {
    return this.imports.preview(body.csv);
  }

  @Post()
  @RequirePermission('settings.manage')
  run(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(importRequestSchema)) body: ImportRequest): Promise<ImportResult> {
    return this.imports.run(user, body.csv);
  }
}
