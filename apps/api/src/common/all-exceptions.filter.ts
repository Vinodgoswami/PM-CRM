import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { type Response } from 'express';
import { AppError } from './errors';

const HTTP_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/** Every error leaves the API as `{ error: { code, message, details? } }`; unexpected errors reveal nothing. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      const body: Record<string, unknown> = { code: exception.code, message: exception.message };
      if (exception.details !== undefined) body.details = exception.details;
      res.status(exception.status).json({ error: body });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = status === 404 ? 'Not found' : exception.message;
      res.status(status).json({ error: { code: HTTP_CODES[status] ?? 'ERROR', message } });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
}
