import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import type { User } from '@/api/client';
import type { ConversationDetail, Message } from '@/conversations/conversations-api';

export const testUser: User = {
  id: 'user-1',
  email: 'theo@exemple.fr',
  displayName: 'Théo Martin',
  createdAt: '2026-11-20T10:00:00.000Z',
};

export const TEST_PASSWORD = 'correct horse battery staple';

const loginBodySchema = z.object({ email: z.string(), password: z.string() });

let nextId = 1;

/**
 * In-memory stand-in for the API: tests flip `loggedIn` to start authenticated and seed the
 * user's conversations with `addConversation`.
 */
export const backend = {
  loggedIn: false,
  loginRequests: 0,
  conversations: [] as ConversationDetail[],

  reset() {
    this.loggedIn = false;
    this.loginRequests = 0;
    this.conversations = [];
    nextId = 1;
  },

  /** Adds a conversation; `lastMessageAt` defaults to now, messages to none. */
  addConversation(
    fields: Partial<Omit<ConversationDetail, 'messages'>> & { messages?: Partial<Message>[] } = {},
  ): ConversationDetail {
    const now = new Date().toISOString();
    const id = fields.id ?? `conversation-${nextId++}`;
    const conversation: ConversationDetail = {
      id,
      title: fields.title ?? 'Nouvelle conversation',
      createdAt: fields.createdAt ?? now,
      updatedAt: fields.updatedAt ?? now,
      lastMessageAt: fields.lastMessageAt ?? now,
      messages: (fields.messages ?? []).map((message, index) => ({
        id: message.id ?? `${id}-message-${index + 1}`,
        role: message.role ?? 'user',
        content: message.content ?? '',
        interrupted: message.interrupted ?? false,
        createdAt: message.createdAt ?? now,
      })),
    };
    this.conversations.push(conversation);
    return conversation;
  },

  findConversation(id: string): ConversationDetail | undefined {
    return this.conversations.find((conversation) => conversation.id === id);
  },
};

const unauthorized = () => new HttpResponse(null, { status: 401 });
const notFound = () =>
  HttpResponse.json({ message: 'Conversation not found', statusCode: 404 }, { status: 404 });

export const handlers = [
  http.get('/api/auth/me', () => (backend.loggedIn ? HttpResponse.json(testUser) : unauthorized())),

  http.post('/api/auth/login', async ({ request }) => {
    backend.loginRequests += 1;
    const body: unknown = await request.json();
    const credentials = loginBodySchema.parse(body);
    if (credentials.email !== testUser.email || credentials.password !== TEST_PASSWORD) {
      return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    backend.loggedIn = true;
    return HttpResponse.json(testUser);
  }),

  http.post('/api/auth/logout', () => {
    backend.loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/conversations', () => {
    if (!backend.loggedIn) return unauthorized();
    const list = backend.conversations
      .map(({ messages: _messages, ...conversation }) => conversation)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return HttpResponse.json(list);
  }),

  http.get('/api/conversations/:id', ({ params }) => {
    if (!backend.loggedIn) return unauthorized();
    const conversation = backend.findConversation(String(params['id']));
    return conversation ? HttpResponse.json(conversation) : notFound();
  }),
];

export const server = setupServer(...handlers);
