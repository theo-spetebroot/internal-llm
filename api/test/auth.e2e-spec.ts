import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser, getSetCookies, loginAs, type TestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

describe('Auth (e2e)', () => {
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let alice: TestUser;

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ http, prisma } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    alice = await createTestUser(prisma, 'Alice');
  });

  describe('POST /api/auth/login', () => {
    it('returns the user and sets an httpOnly, SameSite=Strict session cookie', async () => {
      const response = await request(http)
        .post('/api/auth/login')
        .send({ email: alice.email, password: alice.password })
        .expect(200);

      expect(response.body).toEqual({
        id: alice.user.id,
        email: alice.email,
        displayName: 'Alice',
        role: 'USER',
        createdAt: alice.user.createdAt.toISOString(),
      });
      expect(response.body).not.toHaveProperty('passwordHash');

      const cookie = getSetCookies(response.headers).find((c) => c.startsWith('access_token='));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).toMatch(/Max-Age=3600/);
    });

    it('accepts the email case-insensitively', async () => {
      await request(http)
        .post('/api/auth/login')
        .send({ email: `  ${alice.email.toUpperCase()} `, password: alice.password })
        .expect(200);
    });

    it('rejects a wrong password and an unknown email with the same 401', async () => {
      const wrongPassword = await request(http)
        .post('/api/auth/login')
        .send({ email: alice.email, password: 'not-the-password' })
        .expect(401);
      const unknownEmail = await request(http)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever-password' })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(getSetCookies(wrongPassword.headers)).toHaveLength(0);
    });

    it('returns 400 with validation issues on a malformed body', async () => {
      const response = await request(http)
        .post('/api/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

      const body = response.body as { message: string; issues: unknown[] };
      expect(body.message).toBe('Validation failed');
      expect(body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'password' }),
        ]),
      );
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user with a valid session cookie', async () => {
      const cookie = await loginAs(http, alice);

      const response = await request(http).get('/api/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body).toMatchObject({ id: alice.user.id, email: alice.email, role: 'USER' });
    });

    it('returns 401 without a session cookie', async () => {
      await request(http).get('/api/auth/me').expect(401);
    });

    it('returns 401 with a tampered token', async () => {
      const cookie = await loginAs(http, alice);
      await request(http).get('/api/auth/me').set('Cookie', `${cookie}tampered`).expect(401);
    });

    it('returns 401 when the account no longer exists', async () => {
      const cookie = await loginAs(http, alice);
      await prisma.user.delete({ where: { id: alice.user.id } });

      await request(http).get('/api/auth/me').set('Cookie', cookie).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const cookie = await loginAs(http, alice);

      const response = await request(http)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cleared = getSetCookies(response.headers).find((c) => c.startsWith('access_token='));
      expect(cleared).toMatch(/^access_token=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('GET /api/health', () => {
    it('stays public', async () => {
      await request(http).get('/api/health').expect(200);
    });
  });
});
