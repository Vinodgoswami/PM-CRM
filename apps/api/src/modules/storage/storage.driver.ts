/** Private object storage. URLs are short-lived and signed; the bucket is never public (docs/04 § Documents). */
export interface StorageDriver {
  presignPut(key: string, mimeType: string, sizeBytes: number): Promise<{ url: string; headers: Record<string, string> }>;
  presignGet(key: string, fileName: string): Promise<string>;
  head(key: string): Promise<{ sizeBytes: number; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
export const PUT_TTL_MS = 5 * 60_000;
export const GET_TTL_MS = 60_000;

/** Filename safe inside a quoted Content-Disposition value. */
export const safeFileName = (name: string) => name.replace(/["\\\r\n]/g, '').trim() || 'download';
