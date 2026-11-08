import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { type Request } from 'express';
import { from, type Observable, switchMap } from 'rxjs';
import { RecurringService } from './recurring.service';

/** D-063: before the first signed-in read of each day, recurring milestones that came due are created. */
@Injectable()
export class RecurringCatchUp implements NestInterceptor {
  private readonly logger = new Logger('Recurring');

  constructor(private readonly recurring: RecurringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method !== 'GET' || !req.user) return next.handle();
    const catchUp = this.recurring.syncIfNewDay().catch((e: unknown) => this.logger.warn(`Catch-up failed: ${String(e)}`));
    return from(catchUp).pipe(switchMap(() => next.handle()));
  }
}
