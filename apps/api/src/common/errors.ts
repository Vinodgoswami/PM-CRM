/** Domain errors mapped to the API error contract by AllExceptionsFilter (docs/10-api-spec.md). */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** A business rule from docs/06 was broken; `rule` is its id, e.g. "P-2". */
export class RuleViolation extends AppError {
  constructor(rule: string, message: string) {
    super(400, 'VALIDATION_FAILED', message, { rule });
    this.name = 'RuleViolation';
  }
}

export const unauthenticated = (message = 'Not signed in') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const rateLimited = (message = 'Too many attempts. Try again later.') => new AppError(429, 'RATE_LIMITED', message);
