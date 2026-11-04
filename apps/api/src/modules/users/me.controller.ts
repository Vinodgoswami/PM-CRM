import { randomUUID } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Res } from '@nestjs/common';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, avatarUploadSchema, preferencesSchema, setAvatarSchema } from '@salescrm/schemas';
import { type Response } from 'express';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { Authenticated } from '../../common/decorators';
import { AppError, notFound } from '../../common/errors';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { STORAGE_DRIVER, type StorageDriver } from '../storage/storage.driver';
import { avatarUrlFor } from './avatar-url';

/** Your own profile photo: upload (signed URL), confirm, remove; anyone signed in may view a photo. */
@Controller()
@Authenticated()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** D-036: your own dashboard currency (null = the company base currency). */
  @Patch('me/preferences')
  async preferences(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(preferencesSchema)) body: z.infer<typeof preferencesSchema>,
  ) {
    await this.prisma.user.update({ where: { id: user.id }, data: { displayCurrency: body.displayCurrency } });
    return { displayCurrency: body.displayCurrency };
  }

  @Post('me/avatar/upload-url')
  async uploadUrl(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(avatarUploadSchema)) body: z.infer<typeof avatarUploadSchema>,
  ) {
    const key = `avatars/${user.id}/${randomUUID()}`;
    const { url, headers } = await this.storage.presignPut(key, body.mimeType, body.sizeBytes);
    return { key, url, headers };
  }

  @Post('me/avatar')
  @HttpCode(200)
  async set(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(setAvatarSchema)) body: z.infer<typeof setAvatarSchema>) {
    // Only an upload you were given a slot for, that really is a small image, becomes your photo.
    const stored = body.key.startsWith(`avatars/${user.id}/`) ? await this.storage.head(body.key) : null;
    const ok = stored && (AVATAR_TYPES as readonly string[]).includes(stored.mimeType) && stored.sizeBytes <= AVATAR_MAX_BYTES;
    if (!ok) throw new AppError(400, 'VALIDATION_FAILED', 'Upload a JPEG, PNG or WebP image up to 2 MB first.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { avatarKey: body.key } });
      await this.audit.record(tx, { actorId: user.id, action: 'user.avatar', entity: 'User', entityId: user.id });
    });
    if (user.avatarKey && user.avatarKey !== body.key) await this.storage.delete(user.avatarKey).catch(() => undefined);
    return { avatarUrl: avatarUrlFor(user.id, body.key) };
  }

  @Delete('me/avatar')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { avatarKey: null } });
      await this.audit.record(tx, { actorId: user.id, action: 'user.avatar_remove', entity: 'User', entityId: user.id });
    });
    if (user.avatarKey) await this.storage.delete(user.avatarKey).catch(() => undefined);
  }

  @Get('users/:id/avatar')
  async view(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: { avatarKey: true } });
    if (!row?.avatarKey) throw notFound();
    res.redirect(302, await this.storage.presignGet(row.avatarKey, 'avatar'));
  }
}
