import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { PublicError } from './public-error.js';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: z.ZodType<T>,
    private readonly code = 'VALIDATION_FAILED',
    private readonly message = 'Confira os campos informados.',
  ) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new PublicError(422, this.code, this.message);
    }
    return result.data;
  }
}
