import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { API_PREFIX } from '../app.setup.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { getOpenApiComponents } from '../common/zod/zod-openapi.js';

export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/** Builds the OpenAPI document — the contract consumed by the web client. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('internal-llm API')
    .setDescription('REST + SSE API of internal-llm, a web chat interface for a self-hosted LLM.')
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...getOpenApiComponents() },
  };
  return document;
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app));
}
