import { Controller, Get, HttpCode, Inject, Param, Put, Req, Res } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { type Request, type Response } from 'express';
import { Public } from '../../common/decorators';
import { AppError, forbidden, notFound } from '../../common/errors';
import { LocalDriver } from './local.driver';
import { attachmentDisposition, STORAGE_DRIVER, type StorageDriver } from './storage.driver';

/**
 * Serves signed local-disk URLs in development. The HMAC-signed token is the authorisation (like an S3 presigned
 * URL), so the route is public; it only exists when STORAGE_DRIVER=local.
 */
@Controller('storage/local')
export class LocalStorageController {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  private local(): LocalDriver {
    if (!(this.driver instanceof LocalDriver)) throw notFound();
    return this.driver;
  }

  @Public()
  @Put(':token')
  @HttpCode(200)
  async put(@Param('token') token: string, @Req() req: Request): Promise<{ ok: true }> {
    const local = this.local();
    const grant = local.verify(token, 'put');
    if (!grant) throw forbidden('This upload link is invalid or has expired.');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (grant.s !== undefined && body.length > grant.s) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The file is larger than declared.');
    const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    if (type !== grant.m) throw new AppError(400, 'VALIDATION_FAILED', 'The file type does not match the upload request.');
    await local.write(grant.k, body, type);
    return { ok: true };
  }

  @Public()
  @Get(':token')
  async get(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const local = this.local();
    const grant = local.verify(token, 'get');
    if (!grant) throw forbidden('This download link is invalid or has expired.');
    const meta = await local.head(grant.k);
    if (!meta) throw notFound();
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(meta.sizeBytes));
    res.setHeader('Content-Disposition', attachmentDisposition(grant.f ?? 'download'));
    createReadStream(local.filePath(grant.k)).pipe(res);
  }
}
