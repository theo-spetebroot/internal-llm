import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export const API_PREFIX = 'api';

/** HTTP setup shared by the real server and the e2e tests, so both behave identically. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableShutdownHooks();
}
