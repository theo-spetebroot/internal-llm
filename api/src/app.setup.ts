import type { INestApplication } from '@nestjs/common';
// Not exported by the package root, although callers pass it as a plain object.
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface.js';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';

export const API_PREFIX = 'api';

/**
 * Options of `NestFactory.create` and `createNestApplication`, for the server, the tests and
 * the OpenAPI export alike: the start-up logs are held back until `configureApp` has set the
 * logger, so that they go through it too.
 */
export const APP_FACTORY_OPTIONS = Object.assign(new NestApplicationContextOptions(), {
  bufferLogs: true,
});

/** HTTP setup shared by the real server and the e2e tests, so both behave identically. */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableShutdownHooks();
}
