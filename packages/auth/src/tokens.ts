import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Opaque bearer secret for cookies and one-time links. Only its HMAC is stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

/** CSRF token derived from the session token, so it needs no storage and dies with the session. */
export function csrfTokenFor(sessionToken: string, secret: string): string {
  return hashToken(`csrf:${sessionToken}`, secret);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
