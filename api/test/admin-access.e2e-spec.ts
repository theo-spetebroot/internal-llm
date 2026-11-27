import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser, loginAs } from './helpers/auth.js';
import { AdminProbeModule } from './helpers/admin-probe.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

const PROBE = '/api/test-admin/probe';

describe('Admin routes (e2e)', () => {
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let memberCookie: string;
  let adminCookie: string;
  let memberId: string;
  let adminId: string;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, [AdminProbeModule]);
    ({ http, prisma } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const member = await createTestUser(prisma, 'Member');
    const admin = await createTestUser(prisma, 'Boss');
    memberId = member.user.id;
    adminId = admin.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
    memberCookie = await loginAs(http, member);
    adminCookie = await loginAs(http, admin);
  });

  it('answers 401 without a session', async () => {
    await request(http).get(PROBE).expect(401);
  });

  it('answers 403 to a signed-in user who is not an admin', async () => {
    await request(http).get(PROBE).set('Cookie', memberCookie).expect(403);
  });

  it('lets an admin through', async () => {
    await request(http).get(PROBE).set('Cookie', adminCookie).expect(200);
  });

  it('applies a role change at once, to the session already open', async () => {
    await request(http).get(PROBE).set('Cookie', memberCookie).expect(403);

    await prisma.user.update({ where: { id: memberId }, data: { role: 'ADMIN' } });
    await request(http).get(PROBE).set('Cookie', memberCookie).expect(200);

    await prisma.user.update({ where: { id: memberId }, data: { role: 'USER' } });
    await request(http).get(PROBE).set('Cookie', memberCookie).expect(403);
  });
});
