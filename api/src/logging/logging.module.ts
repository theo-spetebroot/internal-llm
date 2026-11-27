import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import type { Env } from '../config/env.schema.js';
import { createLoggerParams } from './logger.config.js';

/**
 * Where the logs are written when it is not the standard output. Never provided by the
 * application: tests override it to read the log lines.
 */
export const LOG_STREAM = Symbol('LOG_STREAM');

@Module({
  imports: [
    LoggerModule.forRootAsync({
      providers: [{ provide: LOG_STREAM, useValue: undefined }],
      inject: [ConfigService, { token: LOG_STREAM, optional: true }],
      useFactory: (config: ConfigService<Env, true>, stream: DestinationStream | undefined) =>
        createLoggerParams(
          {
            nodeEnv: config.get('NODE_ENV', { infer: true }),
            level: config.get('LOG_LEVEL', { infer: true }),
          },
          stream,
        ),
    }),
  ],
})
export class LoggingModule {}
