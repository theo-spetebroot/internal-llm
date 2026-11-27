import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Params } from 'nestjs-pino';
import { type DestinationStream, stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';

import type { Env } from '../config/env.schema.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

/** What replaces a masked value in the logs. */
export const REDACTED = '[Redacted]';

/**
 * Masked wherever they appear in a log line, as a second line of defence: the request and
 * response serializers below already keep headers, bodies and cookies out of the logs, and the
 * code never logs message contents. A path with `*` stands for any key at that level.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body',
  'res.body',
  'password',
  'passwordHash',
  'token',
  'authorization',
  'cookie',
  'content',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.authorization',
  '*.cookie',
  '*.content',
  '*.*.password',
  '*.*.authorization',
  '*.*.cookie',
];

/** Polled by Docker every few seconds: logging it would drown the useful lines. */
const HEALTH_PATH = '/api/health';

/** The path of a URL, without its query string. */
function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

interface AuthenticatedRequest extends IncomingMessage {
  user?: { id?: string };
}

export interface LoggerSettings {
  nodeEnv: Env['NODE_ENV'];
  level: Env['LOG_LEVEL'];
}

/**
 * Configuration of the logger.
 *
 * - Production and tests: one JSON object per line. Development: readable lines (`pino-pretty`,
 *   a development dependency).
 * - Every request gets an id (the valid `X-Request-Id` it came with, else a new UUID), returned
 *   in the response and present as `requestId` in every log line written while handling it.
 * - One line per request: method, path (no query string), status, duration, and the user id once
 *   signed in. Never the body, the headers or the cookies.
 * - Tests are silent unless they hand over a `stream` to read the lines from.
 */
export function createLoggerParams(
  { nodeEnv, level }: LoggerSettings,
  stream?: DestinationStream,
): Params {
  const options: Options = {
    level: nodeEnv === 'test' && !stream ? 'silent' : level,
    // No pid and hostname: the container already says which process this is.
    base: null,
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: REDACTED },

    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // Logs written while handling a request carry the request id, not the whole request.
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId' },

    serializers: {
      req: (req: IncomingMessage) => ({ method: req.method, path: pathOf(req.url) }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    customProps: (req: IncomingMessage) => ({ userId: (req as AuthenticatedRequest).user?.id }),
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    customSuccessMessage: (req, res) => `${req.method ?? ''} ${pathOf(req.url)} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method ?? ''} ${pathOf(req.url)} ${res.statusCode}`,
    autoLogging: { ignore: (req) => pathOf(req.url) === HEALTH_PATH },
  };

  if (nodeEnv === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    };
  } else {
    // Levels as words (`"level":"info"`) rather than numbers. Not allowed with a transport.
    options.formatters = { level: (label) => ({ level: label }) };
  }

  return { pinoHttp: stream ? [options, stream] : options };
}
