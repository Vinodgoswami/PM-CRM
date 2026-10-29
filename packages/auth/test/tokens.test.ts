import { expect, test } from 'vitest';
import { csrfTokenFor, generateToken, hashPassword, hashToken, safeEqual, verifyPassword } from '../src/index';

const SECRET = 'test-only-secret-000000000000000000000000';

test('generateToken returns 32 random bytes as base64url', () => {
  const a = generateToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(generateToken()).not.toBe(a);
});

test('hashToken is deterministic per secret and never the raw token', () => {
  const token = generateToken();
  expect(hashToken(token, SECRET)).toBe(hashToken(token, SECRET));
  expect(hashToken(token, SECRET)).not.toBe(token);
  expect(hashToken(token, `${SECRET}x`)).not.toBe(hashToken(token, SECRET));
});

test('csrf token is bound to the session token but differs from its hash', () => {
  const token = generateToken();
  expect(csrfTokenFor(token, SECRET)).toBe(csrfTokenFor(token, SECRET));
  expect(csrfTokenFor(token, SECRET)).not.toBe(hashToken(token, SECRET));
});

test('safeEqual compares in constant time and handles length mismatch', () => {
  expect(safeEqual('abc', 'abc')).toBe(true);
  expect(safeEqual('abc', 'abd')).toBe(false);
  expect(safeEqual('abc', 'abcd')).toBe(false);
});

test('argon2id password hashes verify only the original password', async () => {
  const hash = await hashPassword('correct horse battery');
  expect(hash.startsWith('$argon2id$')).toBe(true);
  expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
  expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false);
});
