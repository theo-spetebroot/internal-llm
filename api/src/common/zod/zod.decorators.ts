import { applyDecorators, Body, SetMetadata } from '@nestjs/common';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';

import { toOpenApiSchema } from './zod-openapi.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export const ZOD_RESPONSE_SCHEMA = Symbol('zod-response-schema');

/**
 * `@Body()` validated by a Zod schema, documented in Swagger from the same schema.
 * The annotated parameter should be typed as `z.output<typeof schema>`.
 */
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Body(new ZodValidationPipe(schema))(target, propertyKey, parameterIndex);

    if (propertyKey === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    if (descriptor) {
      ApiBody({
        schema: toOpenApiSchema(schema, 'input'),
        // Optional when the schema accepts a missing body (e.g. `.default({})`).
        required: !schema.safeParse(undefined).success,
      })(target, propertyKey, descriptor);
    }
  };
}

interface ZodResponseOptions {
  status: number;
  description: string;
  schema?: z.ZodType;
}

/**
 * Documents a response from a Zod schema. For success statuses, the schema is also applied
 * to the handler's return value by `ZodSerializerInterceptor`, which strips unknown fields
 * (e.g. a password hash can never leak through a response).
 */
export function ZodResponse({ status, description, schema }: ZodResponseOptions): MethodDecorator {
  if (!schema) {
    return applyDecorators(ApiResponse({ status, description }));
  }
  const decorators = [
    ApiResponse({ status, description, schema: toOpenApiSchema(schema, 'output') }),
  ];
  if (status >= 200 && status < 300) {
    decorators.push(SetMetadata(ZOD_RESPONSE_SCHEMA, schema));
  }
  return applyDecorators(...decorators);
}
