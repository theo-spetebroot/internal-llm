import { Writable } from 'node:stream';

import { pino } from 'pino';
import type { Options } from 'pino-http';
import { describe, expect, it } from 'vitest';

import { createLoggerParams, REDACT_PATHS, REDACTED } from './logger.config.js';

const sink = new Writable({
  write: (_chunk, _encoding, done) => {
    done();
  },
});

/** The pino-http options inside the params, whether or not a stream was given. */
function optionsOf(...args: Parameters<typeof createLoggerParams>): Options {
  const { pinoHttp } = createLoggerParams(...args);
  const options = Array.isArray(pinoHttp) ? pinoHttp[0] : pinoHttp;
  if (!options || !('level' in options || 'redact' in options)) {
    throw new Error('Expected pino-http options');
  }
  return options;
}

describe('createLoggerParams', () => {
  describe('level', () => {
    it('follows LOG_LEVEL', () => {
      expect(optionsOf({ nodeEnv: 'production', level: 'warn' }).level).toBe('warn');
      expect(optionsOf({ nodeEnv: 'development', level: 'debug' }).level).toBe('debug');
    });

    it('is silent in tests, unless a stream is given to read the lines from', () => {
      expect(optionsOf({ nodeEnv: 'test', level: 'info' }).level).toBe('silent');
      expect(optionsOf({ nodeEnv: 'test', level: 'info' }, sink).level).toBe('info');
    });
  });

  describe('output', () => {
    it('is JSON with the level as a word in production', () => {
      const options = optionsOf({ nodeEnv: 'production', level: 'info' });

      expect(options.transport).toBeUndefined();
      expect(options.formatters?.level?.('info', 30)).toEqual({ level: 'info' });
    });

    it('is readable in development', () => {
      const options = optionsOf({ nodeEnv: 'development', level: 'info' });

      expect(options.transport).toMatchObject({ target: 'pino-pretty' });
    });

    it('writes to the given stream', () => {
      const { pinoHttp } = createLoggerParams({ nodeEnv: 'test', level: 'info' }, sink);

      expect(Array.isArray(pinoHttp) && pinoHttp[1]).toBe(sink);
    });
  });

  describe('redaction', () => {
    /** Logs `payload` with the redaction rules of the application and returns the line. */
    function logged(payload: object): Record<string, unknown> {
      let line = '';
      const capture = new Writable({
        write: (chunk: Buffer, _encoding, done) => {
          line += chunk.toString();
          done();
        },
      });
      const { redact } = optionsOf({ nodeEnv: 'production', level: 'info' });
      if (!redact) throw new Error('The logger has no redaction rules');
      pino({ redact }, capture).info(payload, 'probe');
      return JSON.parse(line) as Record<string, unknown>;
    }

    it('masks the authorization header and the cookies of a request', () => {
      const line = logged({
        req: { headers: { authorization: 'Bearer top-secret', cookie: 'access_token=abc' } },
      });

      expect(line['req']).toEqual({
        headers: { authorization: REDACTED, cookie: REDACTED },
      });
    });

    it('masks the cookies a response sets', () => {
      const line = logged({ res: { headers: { 'set-cookie': ['access_token=abc; HttpOnly'] } } });

      expect(line['res']).toEqual({ headers: { 'set-cookie': REDACTED } });
    });

    it('masks request and response bodies', () => {
      const line = logged({
        req: { body: { content: 'hello', password: 'hunter2' } },
        res: { body: 'x' },
      });

      expect(line['req']).toEqual({ body: REDACTED });
      expect(line['res']).toEqual({ body: REDACTED });
    });

    it.each([
      ['password', { password: 'hunter2' }],
      ['passwordHash', { passwordHash: '$argon2id$v=19$...' }],
      ['token', { token: 'abc' }],
      ['content', { content: 'a private message' }],
      ['authorization', { authorization: 'Bearer abc' }],
      ['cookie', { cookie: 'access_token=abc' }],
      ['nested password', { user: { password: 'hunter2' } }],
      ['nested content', { message: { content: 'a private message' } }],
      ['two levels deep', { body: { user: { password: 'hunter2' } } }],
    ])('masks %s wherever it is logged', (_name, payload) => {
      const text = JSON.stringify(logged(payload));

      expect(text).toContain(REDACTED);
      expect(text).not.toMatch(
        /hunter2|argon2id|private message|Bearer abc|access_token=abc|"abc"/,
      );
    });

    it('leaves harmless values alone', () => {
      const line = logged({ requestId: 'abc', req: { method: 'GET', path: '/api/health' } });

      expect(line['requestId']).toBe('abc');
      expect(line['req']).toEqual({ method: 'GET', path: '/api/health' });
    });

    it('lists every rule it applies', () => {
      expect(REDACT_PATHS).toEqual(
        expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie', '*.password']),
      );
    });
  });
});
