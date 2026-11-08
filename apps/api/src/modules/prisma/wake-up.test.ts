import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Prisma } from '@salescrm/database';
import { defer, firstValueFrom } from 'rxjs';
import { expect, test } from 'vitest';
import { TRANSACTION_OPTIONS, databaseUrlWithTimeouts, isDatabaseWakeUpError, RetryOnDatabaseWakeUp, withWakeUpRetry } from './wake-up';

// D-050: Neon pauses when idle; the first requests after that may hit stale or slow connections.
const known = (code: string) => new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: 'test' });

test('the database URL gets longer connect and pool timeouts unless it sets its own', () => {
  expect(databaseUrlWithTimeouts('postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db?connect_timeout=30&pool_timeout=30');
  expect(databaseUrlWithTimeouts('postgresql://u:p@h/db?sslmode=require&connect_timeout=10')).toBe(
    'postgresql://u:p@h/db?sslmode=require&connect_timeout=10&pool_timeout=30',
  );
});

test('only connection problems count as a waking database', () => {
  for (const code of ['P1001', 'P1002', 'P1017', 'P2024']) expect(isDatabaseWakeUpError(known(code))).toBe(true);
  expect(isDatabaseWakeUpError(new Prisma.PrismaClientInitializationError("Can't reach database server", 'test', 'P1001'))).toBe(true);
  expect(isDatabaseWakeUpError(new Error('Server has closed the connection.'))).toBe(true);
  expect(isDatabaseWakeUpError(known('P2002'))).toBe(false);
  expect(isDatabaseWakeUpError(new Error('boom'))).toBe(false);
});

const ctx = { getType: () => 'http' } as unknown as ExecutionContext;
const handler = (fail: unknown[], calls: { n: number }): CallHandler => ({
  handle: () =>
    defer(async () => {
      calls.n += 1;
      const err = fail.shift();
      if (err) throw err;
      return 'ok';
    }),
});

test('a request that meets a waking database is retried and then succeeds', async () => {
  const calls = { n: 0 };
  const result = await firstValueFrom(new RetryOnDatabaseWakeUp(1).intercept(ctx, handler([known('P1017'), known('P1001')], calls)));
  expect(result).toBe('ok');
  expect(calls.n).toBe(3);
});

test('other errors are not retried, and retrying stops after two tries', async () => {
  const other = { n: 0 };
  await expect(firstValueFrom(new RetryOnDatabaseWakeUp(1).intercept(ctx, handler([known('P2002')], other)))).rejects.toThrow();
  expect(other.n).toBe(1);
  const stuck = { n: 0 };
  await expect(
    firstValueFrom(new RetryOnDatabaseWakeUp(1).intercept(ctx, handler([known('P1001'), known('P1001'), known('P1001')], stuck))),
  ).rejects.toThrow();
  expect(stuck.n).toBe(3);
});

test('withWakeUpRetry runs a single lookup again (the session check runs before the request retry can help)', async () => {
  let n = 0;
  await expect(withWakeUpRetry(async () => (++n < 3 ? Promise.reject(known('P1017')) : 'ok'), 1)).resolves.toBe('ok');
  expect(n).toBe(3);
  let m = 0;
  await expect(withWakeUpRetry(async () => (++m, Promise.reject(known('P2002'))), 1)).rejects.toThrow();
  expect(m).toBe(1);
});

test('transactions may wait 10 s for a connection and run for 20 s (Prisma: 2 s and 5 s)', () => {
  expect(TRANSACTION_OPTIONS).toEqual({ maxWait: 10_000, timeout: 20_000 });
});
