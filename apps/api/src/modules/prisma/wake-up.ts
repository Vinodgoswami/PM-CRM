import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { Prisma } from '@salescrm/database';
import { type Observable, retry, timer } from 'rxjs';

/**
 * D-050: a database that scales to zero (Neon free) takes a few seconds to wake, longer than Prisma's 5 s connect
 * default. URLs that set their own values keep them.
 */
export function databaseUrlWithTimeouts(url: string): string {
  const parsed = new URL(url);
  for (const key of ['connect_timeout', 'pool_timeout']) {
    if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, '30');
  }
  return parsed.toString();
}

/**
 * D-052: Prisma gives an interactive transaction 2 s to get a connection and 5 s to finish; a waking or busy database
 * on a free plan can need more, and a cut-off transaction is a 500 for the user.
 */
export const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const WAKE_UP_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const WAKE_UP_MESSAGE = /can't reach database server|server has closed the connection|connection terminated unexpectedly|ECONNRESET/i;

/** A connection that was stale, closed or not yet ready: the query never ran, so the request can safely run again. */
export function isDatabaseWakeUpError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return WAKE_UP_CODES.has(e.code);
  if (e instanceof Prisma.PrismaClientInitializationError) return e.errorCode ? WAKE_UP_CODES.has(e.errorCode) : true;
  return e instanceof Error && WAKE_UP_MESSAGE.test(e.message);
}

/** The same retry for one call made outside a request handler (guards run before interceptors). */
export async function withWakeUpRetry<T>(fn: () => Promise<T>, delayMs = 1000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 2 || !isDatabaseWakeUpError(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}

/** Runs a request again (up to twice, after 1 s and 2 s) when it met a waking database, before the user sees an error. */
@Injectable()
export class RetryOnDatabaseWakeUp implements NestInterceptor {
  private readonly logger = new Logger('Database');

  constructor(private readonly delayMs = 1000) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      retry({
        count: 2,
        delay: (error: unknown, attempt: number) => {
          if (!isDatabaseWakeUpError(error)) throw error;
          this.logger.warn(`Database not ready (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}); retry ${attempt}`);
          return timer(this.delayMs * attempt);
        },
      }),
    );
  }
}
