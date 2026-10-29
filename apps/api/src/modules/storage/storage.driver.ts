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

/**
 * `attachment` with an ASCII fallback plus the exact UTF-8 name (RFC 6266 / 5987), so names like
 * "Proposal – Acme.pdf" neither break the header nor arrive garbled.
 */
export function attachmentDisposition(name: string): string {
  const clean = safeFileName(name);
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
