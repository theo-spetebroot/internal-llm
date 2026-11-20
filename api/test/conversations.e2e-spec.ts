import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONVERSATION_TITLE } from '../src/conversations/conversations.schemas.js';
import { MessageRole } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser, loginAs, type TestUser } from './helpers/auth.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

interface ConversationBody {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

describe('Conversations (e2e)', () => {
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let alice: TestUser;
  let aliceCookie: string;
  let bobCookie: string;

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
    const bob = await createTestUser(prisma, 'Bob');
    aliceCookie = await loginAs(http, alice);
    bobCookie = await loginAs(http, bob);
  });

  async function createConversation(cookie: string, title?: string): Promise<ConversationBody> {
    const response = await request(http)
      .post('/api/conversations')
      .set('Cookie', cookie)
      .send(title === undefined ? {} : { title })
      .expect(201);
    return response.body as ConversationBody;
  }

  it.each([
    ['GET', '/api/conversations'],
    ['POST', '/api/conversations'],
    ['GET', '/api/conversations/some-id'],
    ['PATCH', '/api/conversations/some-id'],
    ['DELETE', '/api/conversations/some-id'],
  ] as const)('%s %s requires a session', async (method, path) => {
    const agent = request(http);
    const call = {
      GET: () => agent.get(path),
      POST: () => agent.post(path),
      PATCH: () => agent.patch(path),
      DELETE: () => agent.delete(path),
    }[method];
    await call().expect(401);
  });

  describe('POST /api/conversations', () => {
    it('creates a conversation with the default title', async () => {
      const conversation = await createConversation(aliceCookie);

      expect(conversation).toEqual({
        id: expect.any(String) as string,
        title: DEFAULT_CONVERSATION_TITLE,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      const stored = await prisma.conversation.findUnique({ where: { id: conversation.id } });
      expect(stored?.userId).toBe(alice.user.id);
    });

    it('accepts a request without body', async () => {
      const response = await request(http)
        .post('/api/conversations')
        .set('Cookie', aliceCookie)
        .expect(201);
      expect((response.body as ConversationBody).title).toBe(DEFAULT_CONVERSATION_TITLE);
    });

    it('accepts an explicit title, trimmed', async () => {
      const conversation = await createConversation(aliceCookie, '  Recettes  ');
      expect(conversation.title).toBe('Recettes');
    });

    it('rejects a blank title', async () => {
      await request(http)
        .post('/api/conversations')
        .set('Cookie', aliceCookie)
        .send({ title: '   ' })
        .expect(400);
    });
  });

  describe('GET /api/conversations', () => {
    it("lists only the user's conversations, most recently active first", async () => {
      const older = await createConversation(aliceCookie, 'Older');
      const newer = await createConversation(aliceCookie, 'Newer');
      await createConversation(bobCookie, 'Bob only');

      const response = await request(http)
        .get('/api/conversations')
        .set('Cookie', aliceCookie)
        .expect(200);

      const titles = (response.body as ConversationBody[]).map((c) => c.title);
      expect(titles).toEqual(['Newer', 'Older']);

      // Activity on the older conversation brings it back to the top.
      await prisma.conversation.update({
        where: { id: older.id },
        data: { updatedAt: new Date(Date.parse(newer.updatedAt) + 1_000) },
      });
      const reordered = await request(http)
        .get('/api/conversations')
        .set('Cookie', aliceCookie)
        .expect(200);
      expect((reordered.body as ConversationBody[]).map((c) => c.title)).toEqual([
        'Older',
        'Newer',
      ]);
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('returns the conversation with its messages in chronological order', async () => {
      const conversation = await createConversation(aliceCookie);
      const base = Date.now();
      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: MessageRole.ASSISTANT,
            content: 'Hi! (cut)',
            interrupted: true,
            createdAt: new Date(base + 1_000),
          },
          {
            conversationId: conversation.id,
            role: MessageRole.USER,
            content: 'Hello',
            createdAt: new Date(base),
          },
        ],
      });

      const response = await request(http)
        .get(`/api/conversations/${conversation.id}`)
        .set('Cookie', aliceCookie)
        .expect(200);

      expect(response.body).toEqual({
        ...conversation,
        messages: [
          {
            id: expect.any(String) as string,
            role: 'user',
            content: 'Hello',
            interrupted: false,
            createdAt: new Date(base).toISOString(),
          },
          {
            id: expect.any(String) as string,
            role: 'assistant',
            content: 'Hi! (cut)',
            interrupted: true,
            createdAt: new Date(base + 1_000).toISOString(),
          },
        ],
      });
    });

    it('returns 404 for an unknown id', async () => {
      await request(http)
        .get('/api/conversations/does-not-exist')
        .set('Cookie', aliceCookie)
        .expect(404);
    });
  });

  describe('PATCH /api/conversations/:id', () => {
    it('renames the conversation', async () => {
      const conversation = await createConversation(aliceCookie);

      const response = await request(http)
        .patch(`/api/conversations/${conversation.id}`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Voyage au Japon' })
        .expect(200);

      expect(response.body).toMatchObject({ id: conversation.id, title: 'Voyage au Japon' });
    });

    it('rejects a missing or too long title', async () => {
      const conversation = await createConversation(aliceCookie);
      for (const body of [{}, { title: 'x'.repeat(201) }]) {
        await request(http)
          .patch(`/api/conversations/${conversation.id}`)
          .set('Cookie', aliceCookie)
          .send(body)
          .expect(400);
      }
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('deletes the conversation and its messages', async () => {
      const conversation = await createConversation(aliceCookie);
      await prisma.message.create({
        data: { conversationId: conversation.id, role: MessageRole.USER, content: 'Hello' },
      });

      await request(http)
        .delete(`/api/conversations/${conversation.id}`)
        .set('Cookie', aliceCookie)
        .expect(204);

      expect(await prisma.conversation.count()).toBe(0);
      expect(await prisma.message.count()).toBe(0);
    });
  });

  describe("isolation: another user's conversation", () => {
    let bobConversationId: string;

    beforeEach(async () => {
      bobConversationId = (await createConversation(bobCookie, 'Private')).id;
    });

    it('cannot be read (404, existence not disclosed)', async () => {
      await request(http)
        .get(`/api/conversations/${bobConversationId}`)
        .set('Cookie', aliceCookie)
        .expect(404);
    });

    it('cannot be renamed', async () => {
      await request(http)
        .patch(`/api/conversations/${bobConversationId}`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Hacked' })
        .expect(404);

      const stored = await prisma.conversation.findUnique({ where: { id: bobConversationId } });
      expect(stored?.title).toBe('Private');
    });

    it('cannot be deleted', async () => {
      await request(http)
        .delete(`/api/conversations/${bobConversationId}`)
        .set('Cookie', aliceCookie)
        .expect(404);

      expect(await prisma.conversation.count({ where: { id: bobConversationId } })).toBe(1);
    });

    it('stays accessible to its owner', async () => {
      await request(http)
        .get(`/api/conversations/${bobConversationId}`)
        .set('Cookie', bobCookie)
        .expect(200);
    });
  });
});
