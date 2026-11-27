import type { Server } from 'node:http';

import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LLM_OPTIONS, LLM_PROVIDER, type LlmOptions } from '../src/llm/llm.service.js';
import { MockLlmProvider } from '../src/llm/providers/mock.provider.js';
import { REDACTED } from '../src/logging/logger.config.js';
import { LOG_STREAM } from '../src/logging/logging.module.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser, loginAs, type TestUser } from './helpers/auth.js';
import { eventually, LogCapture, type LogRecord } from './helpers/log-capture.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const llmOptions: LlmOptions = { stream: true, timeoutMs: 5_000 };

describe('Logging (e2e)', () => {
  const capture = new LogCapture();
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let alice: TestUser;
  let cookie: string;

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder
        .overrideProvider(LOG_STREAM)
        .useValue(capture)
        .overrideProvider(LLM_PROVIDER)
        .useValue(new MockLlmProvider({ tokenDelayMs: { min: 0, max: 0 } }))
        .overrideProvider(LLM_OPTIONS)
        .useValue(llmOptions),
    );
    ({ http, prisma } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    alice = await createTestUser(prisma, 'Alice');
    cookie = await loginAs(http, alice);
    capture.clear();
  });

  /** The request id a response carries. */
  function idOf(response: { headers: Record<string, unknown> }): string {
    const id = response.headers['x-request-id'];
    if (typeof id !== 'string') throw new Error('The response has no X-Request-Id header');
    return id;
  }

  /** The "request completed" line of the request that has this id. */
  function requestLine(requestId: string): Promise<LogRecord> {
    return eventually(() =>
      capture.records.find((record) => record.requestId === requestId && 'responseTime' in record),
    );
  }

  describe('request id', () => {
    it('generates one and returns it in the response', async () => {
      const response = await request(http).get('/api/auth/me').set('Cookie', cookie).expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('generates a different one for each request', async () => {
      const first = await request(http).get('/api/auth/me').set('Cookie', cookie);
      const second = await request(http).get('/api/auth/me').set('Cookie', cookie);

      expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
    });

    it('keeps the id the caller sent when it is valid', async () => {
      const response = await request(http)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .set('X-Request-Id', 'client-req_42.a')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('client-req_42.a');
      expect((await requestLine('client-req_42.a')).requestId).toBe('client-req_42.a');
    });

    it.each([
      ['with a space', 'abc def'],
      ['too long', 'a'.repeat(65)],
      ['with markup', '<script>alert(1)</script>'],
      ['with a quote', 'abc"def'],
      ['empty', ''],
    ])('replaces an id that is %s', async (_label, id) => {
      const response = await request(http)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .set('X-Request-Id', id)
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('is returned on errors too', async () => {
      const unauthorized = await request(http).get('/api/auth/me').expect(401);
      const notFound = await request(http)
        .get('/api/nothing-here')
        .set('Cookie', cookie)
        .expect(404);
      const invalid = await request(http).post('/api/auth/login').send({}).expect(400);

      for (const response of [unauthorized, notFound, invalid]) {
        expect(response.headers['x-request-id']).toMatch(UUID);
      }
    });

    it('is returned on a streamed answer', async () => {
      const conversation = await request(http)
        .post('/api/conversations')
        .set('Cookie', cookie)
        .send({})
        .expect(201);
      const id = (conversation.body as { id: string }).id;

      const response = await request(http)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', cookie)
        .send({ content: 'Hello' })
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('log lines', () => {
    it('are JSON objects, one per line, with an ISO time and the level as a word', async () => {
      await request(http).get('/api/conversations').set('Cookie', cookie).expect(200);
      await eventually(() => (capture.records.length > 0 ? true : undefined));

      for (const record of capture.records) {
        expect(typeof record.level).toBe('string');
        expect(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).toContain(record.level);
        expect(new Date(record['time'] as string).toISOString()).toBe(record['time']);
      }
    });

    it('describe each request: method, path, status, duration and the user', async () => {
      const response = await request(http)
        .get('/api/conversations')
        .set('Cookie', cookie)
        .expect(200);
      const line = await requestLine(idOf(response));

      expect(line).toMatchObject({
        level: 'info',
        msg: 'GET /api/conversations 200',
        req: { method: 'GET', path: '/api/conversations' },
        res: { statusCode: 200 },
        userId: alice.user.id,
      });
      expect(line['responseTime']).toEqual(expect.any(Number));
    });

    it('log client errors as warnings, without a user when nobody is signed in', async () => {
      const response = await request(http).get('/api/auth/me').expect(401);
      const line = await requestLine(idOf(response));

      expect(line).toMatchObject({ level: 'warn', res: { statusCode: 401 } });
      expect(line).not.toHaveProperty('userId');
    });

    it('leave the query string out', async () => {
      await request(http)
        .get('/api/conversations?secret=query-string-value')
        .set('Cookie', cookie)
        .expect(200);
      await eventually(() =>
        capture.records.find((record) => (record['req'] as { path?: string } | undefined)?.path),
      );

      expect(capture.text).not.toContain('query-string-value');
    });

    it('do not include the health check, polled every few seconds', async () => {
      await request(http).get('/api/health').expect(200);
      await request(http).get('/api/auth/me').expect(401);
      await eventually(() => capture.records.find((record) => record.level === 'warn'));

      expect(capture.text).not.toContain('/api/health');
    });
  });

  describe('sensitive data', () => {
    const password = 'a-very-secret-password-4521';
    const messageText = 'my private message about the merger';
    const bearer = 'Bearer top-secret-bearer-value';

    it('never reaches the logs: passwords, cookies, tokens, message contents', async () => {
      // Signs in, so that the response sets the session cookie.
      const login = await request(http)
        .post('/api/auth/login')
        .send({ email: alice.email, password: alice.password })
        .expect(200);
      const sessionCookie = (login.headers['set-cookie'] as unknown as string[])[0] ?? '';
      const sessionToken = sessionCookie.split(';')[0]?.split('=')[1] ?? '';
      expect(sessionToken.length).toBeGreaterThan(20);

      // A wrong password, a bearer header and a body full of secrets.
      await request(http)
        .post('/api/auth/login')
        .send({ email: alice.email, password })
        .expect(401);
      await request(http)
        .get('/api/auth/me')
        .set('Authorization', bearer)
        .set('Cookie', cookie)
        .expect(200);
      const conversation = await request(http)
        .post('/api/conversations')
        .set('Cookie', cookie)
        .send({ title: 'Private title 8841' })
        .expect(201);
      const id = (conversation.body as { id: string }).id;
      await request(http)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', cookie)
        .send({ content: messageText })
        .expect(200);

      await eventually(() =>
        capture.records.filter((record) => 'responseTime' in record).length >= 5 ? true : undefined,
      );

      for (const secret of [
        password,
        alice.password,
        sessionToken,
        cookie.split('=')[1] ?? 'unreachable',
        'top-secret-bearer-value',
        messageText,
        'Private title 8841',
      ]) {
        expect(capture.text, `the logs contain ${secret.slice(0, 12)}…`).not.toContain(secret);
      }
    });

    it('is masked when something logs it anyway', async () => {
      // Transient provider: resolved, not got.
      const logger = await testApp.app.resolve(PinoLogger);

      logger.info(
        {
          password,
          headers: { authorization: bearer, cookie },
          user: { password },
          content: messageText,
          // The request serializer keeps everything but the method and the path.
          req: { method: 'POST', url: '/api/x?token=abc', headers: { authorization: bearer } },
        },
        'probe',
      );

      const line = await eventually(() => capture.records.find((record) => record.msg === 'probe'));
      expect(line).toMatchObject({
        password: REDACTED,
        headers: { authorization: REDACTED, cookie: REDACTED },
        user: { password: REDACTED },
        content: REDACTED,
        req: { method: 'POST', path: '/api/x' },
      });
      expect(line['req']).not.toHaveProperty('headers');
      expect(capture.text).not.toContain(password);
      expect(capture.text).not.toContain(messageText);
      expect(capture.text).not.toContain('top-secret-bearer-value');
      expect(capture.text).not.toContain('token=abc');
    });
  });
});
