import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { PublicError } from './public-error.js';

export class ResourceIdPipe implements PipeTransform<unknown, string> {
  constructor(private readonly message = 'Recurso não encontrado.') {}

  transform(value: unknown): string {
    const result = z.uuid().safeParse(value);
    if (!result.success) {
      throw new PublicError(404, 'NOT_FOUND', this.message);
    }
    return result.data;
  }
}
