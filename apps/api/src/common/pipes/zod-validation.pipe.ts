// T023 — Pipe NestJS qui valide n'importe quelle entrée DTO via un schéma Zod.
// Utilisation : `@Body(new ZodValidationPipe(MySchema)) body: MyDto`.
// Les schémas vivent dans packages/shared/conformite/schemas.ts (T067) ou
// modules équivalents pour partage front/back.

import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export interface ZodValidationError {
  path: string;
  message: string;
  code: string;
}

export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: formatZodError(result.error),
      });
    }
    return result.data;
  }
}

function formatZodError(error: ZodError): ZodValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
