/**
 * Writes the OpenAPI contract to `api/openapi.json` (committed, consumed by `web`'s `gen:api`).
 *
 *   npm run openapi:export
 *
 * The app is created but never initialised: no database connection is opened, so placeholder
 * values are enough for the settings that only matter at runtime. CI regenerates the file and
 * fails when it differs from the committed one.
 */
import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

process.env['DATABASE_URL'] ??= 'postgresql://unused:unused@localhost:5432/unused';
process.env['JWT_SECRET'] ??= 'placeholder-secret-for-openapi-export-only';
process.env['LOG_LEVEL'] ??= 'silent';

// Imported after the placeholders: the config is validated when the module is loaded.
const { AppModule } = await import('../app.module.js');
const { APP_FACTORY_OPTIONS, configureApp } = await import('../app.setup.js');
const { createOpenApiDocument } = await import('./openapi.js');

const OUTPUT = new URL('../../openapi.json', import.meta.url);

Logger.overrideLogger(['error']);
const app = await NestFactory.create(AppModule, APP_FACTORY_OPTIONS);
configureApp(app);
const document = createOpenApiDocument(app);
await app.close();

await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI document written to ${fileURLToPath(OUTPUT)}`);
