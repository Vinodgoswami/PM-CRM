import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type StorageConfig } from '@salescrm/config';
import { attachmentDisposition, GET_TTL_MS, PUT_TTL_MS, type StorageDriver } from './storage.driver';

/** S3-compatible storage (AWS S3, Cloudflare R2, MinIO). */
export class S3Driver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: Extract<StorageConfig, { driver: 's3' }>) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async presignPut(key: string, mimeType: string, sizeBytes: number) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes });
    return { url: await getSignedUrl(this.client, command, { expiresIn: PUT_TTL_MS / 1000 }), headers: { 'Content-Type': mimeType } };
  }

  presignGet(key: string, fileName: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: attachmentDisposition(fileName),
    });
    return getSignedUrl(this.client, command, { expiresIn: GET_TTL_MS / 1000 });
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: Number(res.ContentLength ?? 0), mimeType: res.ContentType ?? '' };
    } catch (e) {
      if ((e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
