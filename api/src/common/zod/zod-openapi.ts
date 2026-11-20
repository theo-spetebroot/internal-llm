import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

const DEFINITIONS_REF = '"$ref":"#/definitions/';
const COMPONENTS_REF = '"$ref":"#/components/schemas/';

/**
 * Named schemas (declared with `.meta({ id: 'Name' })`) collected while decorators run.
 * They are merged into `components.schemas` of the OpenAPI document, so generated
 * client types get readable names instead of anonymous inline objects.
 */
const components = new Map<string, JsonSchema>();

/** Zod dates serialise to ISO strings in JSON responses. */
function dateAsIsoString(ctx: { zodSchema: z.core.$ZodTypes; jsonSchema: JsonSchema }): void {
  if (ctx.zodSchema._zod.def.type === 'date') {
    ctx.jsonSchema['type'] = 'string';
    ctx.jsonSchema['format'] = 'date-time';
  }
}

function rewriteRefs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll(DEFINITIONS_REF, COMPONENTS_REF)) as T;
}

/**
 * Converts a Zod schema to an OpenAPI 3.0 schema object.
 * `io` selects the input shape (request bodies: defaults are optional) or the output shape.
 */
export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { definitions, ...root } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    override: dateAsIsoString,
  }) as JsonSchema & { definitions?: Record<string, JsonSchema> };

  for (const [id, definition] of Object.entries(definitions ?? {})) {
    components.set(id, rewriteRefs(definition));
  }
  return rewriteRefs(root);
}

export function getOpenApiComponents(): Record<string, JsonSchema> {
  return Object.fromEntries(components);
}
