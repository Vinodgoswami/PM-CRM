import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashToken, safeEqual } from '@salescrm/auth';
import { GET_TTL_MS, PUT_TTL_MS, type StorageDriver } from './storage.driver';

/** What a local storage URL authorises. Signed with the session secret; no session needed to use it. */
export interface LocalGrant {
  k: string; // object key
  o: 'put' | 'get';
  e: number; // expiry, epoch ms
  m?: string; // required content type (put)
  s?: number; // maximum bytes (put)
  f?: string; // download file name (get)
}

export const LOCAL_ROUTE = '/api/v1/storage/local';

/** Development storage on local disk, mimicking signed S3 URLs so the upload flow is identical. */
export class LocalDriver implements StorageDriver {
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly secret: string,
  ) {
    this.root = path.resolve(rootDir);
  }

  sign(grant: LocalGrant): string {
    const body = Buffer.from(JSON.stringify(grant)).toString('base64url');
    return `${body}.${hashToken(`storage:${body}`, this.secret)}`;
  }

  /** Returns the grant, or null when the token is malformed, tampered with or expired. */
  verify(token: string, op: LocalGrant['o']): LocalGrant | null {
    const [body, sig] = token.split('.');
    if (!body || !sig || !safeEqual(sig, hashToken(`storage:${body}`, this.secret))) return null;
    try {
      const grant = JSON.parse(Buffer.from(body, 'base64url').toString()) as LocalGrant;
      return grant.o === op && grant.e > Date.now() ? grant : null;
    } catch {
      return null;
    }
  }

  /** Absolute path for a key; refuses anything that would escape the storage root. */
  filePath(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async presignPut(key: string, mimeType: string, sizeBytes: number) {
    const token = this.sign({ k: key, o: 'put', e: Date.now() + PUT_TTL_MS, m: mimeType, s: sizeBytes });
    return { url: `${LOCAL_ROUTE}/${token}`, headers: { 'Content-Type': mimeType } };
  }

  async presignGet(key: string, fileName: string): Promise<string> {
    return `${LOCAL_ROUTE}/${this.sign({ k: key, o: 'get', e: Date.now() + GET_TTL_MS, f: fileName })}`;
  }

  async write(key: string, body: Buffer, mimeType: string): Promise<void> {
    const file = this.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ mimeType }));
  }

  async head(key: string) {
    const file = this.filePath(key);
    try {
      const [info, meta] = await Promise.all([stat(file), readFile(`${file}.meta.json`, 'utf8')]);
      return { sizeBytes: info.size, mimeType: (JSON.parse(meta) as { mimeType: string }).mimeType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.filePath(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }
}
