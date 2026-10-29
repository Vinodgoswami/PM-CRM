import { expect, test } from 'vitest';
import { S3Driver } from '../src/modules/storage/s3.driver';

const driver = new S3Driver({
  driver: 's3',
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  bucket: 'crm-docs',
  region: 'auto',
  accessKeyId: 'AKfake',
  secretAccessKey: 'fake-secret',
});

test('presigned upload URL targets the bucket and key and expires in 5 minutes', async () => {
  const { url, headers } = await driver.presignPut('projects/p1/d1', 'application/pdf', 1234);
  const u = new URL(url);
  expect(u.host).toBe('acc.r2.cloudflarestorage.com');
  expect(u.pathname).toBe('/crm-docs/projects/p1/d1');
  expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(headers).toEqual({ 'Content-Type': 'application/pdf' });
});

test('presigned download URL forces attachment and expires in 60 seconds', async () => {
  const u = new URL(await driver.presignGet('projects/p1/d1', 'Proposal "final".pdf'));
  expect(u.searchParams.get('X-Amz-Expires')).toBe('60');
  expect(u.searchParams.get('response-content-disposition')).toBe('attachment; filename="Proposal final.pdf"');
});
