import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { z } from 'zod';

import { ZOD_RESPONSE_SCHEMA } from './zod.decorators.js';

/** Parses handler results with the success schema declared by `@ZodResponse`. */
@Injectable()
export class ZodSerializerInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schema = this.reflector.get<z.ZodType | undefined>(
      ZOD_RESPONSE_SCHEMA,
      context.getHandler(),
    );
    if (!schema) return next.handle();
    return next.handle().pipe(map((data: unknown) => schema.parse(data)));
  }
}
