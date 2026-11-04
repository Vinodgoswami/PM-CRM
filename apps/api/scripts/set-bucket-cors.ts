/**
 * Lets the website upload to and download from the storage bucket (docs/21):
 * `pnpm --filter @salescrm/api set-bucket-cors`. Needed once per bucket on providers without a CORS screen
 * (Neon Object Storage); harmless to re-run. Reads S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY and WEB_ORIGIN from the environment; prints no secret.
 */
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client, type CORSRule } from '@aws-sdk/client-s3';

export function bucketCorsRules(webOrigin: string): CORSRule[] {
  let url: URL;
  try {
    url = new URL(webOrigin);
  } catch {
    throw new Error(`WEB_ORIGIN must look like https://pmcrm.onrender.com (got "${webOrigin}")`);
  }
  if (url.protocol !== 'https:') throw new Error('WEB_ORIGIN must start with https://');
  if (url.pathname !== '/' || url.search) throw new Error('WEB_ORIGIN must be the bare address, with no path');
  return [{ AllowedOrigins: [url.origin], AllowedMethods: ['GET', 'PUT'], AllowedHeaders: ['Content-Type'], MaxAgeSeconds: 3600 }];
}

async function main(): Promise<void> {
  const need = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'WEB_ORIGIN'] as const;
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Set ${missing.join(', ')} first (the same values as in Render).`);
    process.exit(1);
  }
  const env = process.env as Record<(typeof need)[number], string>;
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  try {
    const rules = bucketCorsRules(env.WEB_ORIGIN);
    await client.send(new PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: rules } }));
    const now = await client.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
    console.warn(`Bucket ${env.S3_BUCKET} now accepts uploads from ${now.CORSRules?.[0]?.AllowedOrigins?.join(', ')}.`);
  } catch (e) {
    console.error(`Could not set CORS: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
