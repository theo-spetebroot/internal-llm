import type { Server } from 'node:http';

import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';

import { AppModule } from '../../src/app.module.js';
import { APP_FACTORY_OPTIONS, configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  /** Underlying HTTP server, to pass to supertest's `request()`. */
  http: Server;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/**
 * Boots the real application (same HTTP setup as production) against the test database.
 * `customize` allows overriding providers, e.g. to swap the LLM provider. `extraModules` adds
 * modules that exist only for the tests (e.g. a probe controller), never the application.
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  extraModules: Type[] = [],
): Promise<TestApp> {
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule, ...extraModules] }),
  ).compile();
  // Logs are silent in tests (see createLoggerParams) unless a test provides LOG_STREAM.
  const app = moduleRef.createNestApplication(APP_FACTORY_OPTIONS);
  configureApp(app);
  await app.init();

  return {
    app,
    http: app.getHttpServer() as Server,
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

/** Empties every table (cascades from users) so that each test starts from a clean state. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE users, conversations, messages, llm_calls CASCADE`;
}
