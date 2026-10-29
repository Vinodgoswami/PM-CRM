import { type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';
import { AppError } from './errors';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Some fields are invalid',
        result.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }
    return result.data;
  }
}
