import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import type { ChatErrorCode, ChatEvent } from '@/api/chat-events';
import type { User } from '@/api/client';
import type { ConversationDetail, Message } from '@/conversations/conversations-api';
import type { AdminStats, UserStats } from '@/usage/stats-api';
import type { UsagePeriod } from '@/usage/usage-period';

import { makeAdminStats, makeUserStats } from './stats-fixtures';

export const testUser: User = {
  id: 'user-1',
  email: 'theo@exemple.fr',
  displayName: 'Théo Martin',
  role: 'USER',
  createdAt: '2026-11-20T10:00:00.000Z',
};

export const TEST_PASSWORD = 'correct horse battery staple';

const loginBodySchema = z.object({ email: z.string(), password: z.string() });
const sendBodySchema = z.object({ content: z.string() });
const renameBodySchema = z.object({ title: z.string().trim().min(1).max(200) });

/** How the fake API answers the next messages (see `backend.chat`). */
export interface ChatScript {
  /** The answer, streamed word by word. Default: "Réponse à : <message>". */
  answer?: string;
  /** End with an `error` event instead, after streaming `partial` (saved as interrupted). */
  error?: { code: ChatErrorCode; partial?: string };
  /** The stream pauses after its first delta until this promise settles. */
  hold?: Promise<unknown>;
  /** Raw SSE chunks to send instead of a well-formed exchange (contract violations). */
  raw?: string[];
}

/** How the fake API answers the stats routes (see `backend.stats`). */
export interface StatsScript {
  /**
   * The answer of `GET /api/stats/me`: the figures, an HTTP error status, or a function of the
   * query (to answer each period). Default: no activity over the requested period.
   */
  me?: UserStats | number | ((query: URLSearchParams) => UserStats | number);
  /**
   * The answer of `GET /api/admin/stats`, like `me`. Default: the figures with no activity if
   * the signed-in user is an admin, a 403 otherwise (as the API does).
   */
  admin?: AdminStats | number | ((query: URLSearchParams) => AdminStats | number);
  /** Every stats answer waits for this promise to settle. */
  hold?: Promise<unknown>;
}

const DEFAULT_TITLE = 'Nouvelle conversation';
const encoder = new TextEncoder();

function sseChunk(event: ChatEvent): Uint8Array<ArrayBuffer> {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

let nextId = 1;

/**
 * In-memory stand-in for the API: tests flip `loggedIn` to start authenticated and seed the
 * user's conversations with `addConversation`.
 */
export const backend = {
  loggedIn: false,
  /** Role of the signed-in user. */
  role: 'USER' as User['role'],
  loginRequests: 0,
  conversations: [] as ConversationDetail[],
  chat: {} as ChatScript,
  sendRequests: 0,
  stats: {} as StatsScript,
  /** Query string of each `GET /api/stats/me` received. */
  statsRequests: [] as URLSearchParams[],
  /** Query string of each `GET /api/admin/stats` received. */
  adminStatsRequests: [] as URLSearchParams[],

  reset() {
    this.loggedIn = false;
    this.role = 'USER';
    this.loginRequests = 0;
    this.conversations = [];
    this.chat = {};
    this.sendRequests = 0;
    this.stats = {};
    this.statsRequests = [];
    this.adminStatsRequests = [];
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
      title: fields.title ?? DEFAULT_TITLE,
      createdAt: fields.createdAt ?? now,
      updatedAt: fields.updatedAt ?? now,
      lastMessageAt: fields.lastMessageAt ?? now,
      messages: (fields.messages ?? []).map((message, index) => ({
        id: message.id ?? `${id}-message-${index + 1}`,
        role: message.role ?? 'user',
        content: message.content ?? '',
        interrupted: message.interrupted ?? false,
        promptTokens: message.promptTokens ?? null,
        completionTokens: message.completionTokens ?? null,
        tokensEstimated: message.tokensEstimated ?? null,
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

const signedInUser = (): User => ({ ...testUser, role: backend.role });

export const handlers = [
  http.get('/api/auth/me', () =>
    backend.loggedIn ? HttpResponse.json(signedInUser()) : unauthorized(),
  ),

  http.post('/api/auth/login', async ({ request }) => {
    backend.loginRequests += 1;
    const body: unknown = await request.json();
    const credentials = loginBodySchema.parse(body);
    if (credentials.email !== testUser.email || credentials.password !== TEST_PASSWORD) {
      return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    backend.loggedIn = true;
    return HttpResponse.json(signedInUser());
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

  http.get('/api/stats/me', async ({ request }) => {
    if (!backend.loggedIn) return unauthorized();
    const query = new URL(request.url).searchParams;
    backend.statsRequests.push(query);
    await backend.stats.hold;

    const { me } = backend.stats;
    const answer = typeof me === 'function' ? me(query) : me;
    if (typeof answer === 'number') return new HttpResponse(null, { status: answer });
    // Without a script: no activity, over the period that was asked for.
    const days = Number(query.get('days') ?? 30) as UsagePeriod;
    return HttpResponse.json(answer ?? makeUserStats({ days }));
  }),

  http.get('/api/admin/stats', async ({ request }) => {
    if (!backend.loggedIn) return unauthorized();
    const query = new URL(request.url).searchParams;
    backend.adminStatsRequests.push(query);
    await backend.stats.hold;

    const { admin } = backend.stats;
    const answer = typeof admin === 'function' ? admin(query) : admin;
    if (typeof answer === 'number') return new HttpResponse(null, { status: answer });
    if (answer === undefined && backend.role !== 'ADMIN') {
      return HttpResponse.json(
        { message: 'Admin role required', statusCode: 403 },
        { status: 403 },
      );
    }
    const days = Number(query.get('days') ?? 30) as UsagePeriod;
    return HttpResponse.json(answer ?? makeAdminStats({ days }));
  }),
];

function withoutMessages({ messages: _messages, ...conversation }: ConversationDetail) {
  return conversation;
}

function saveMessage(
  conversation: ConversationDetail,
  role: Message['role'],
  content: string,
  interrupted = false,
): Message {
  const createdAt = new Date().toISOString();
  const message: Message = {
    id: `${conversation.id}-message-${conversation.messages.length + 1}`,
    role,
    content,
    interrupted,
    promptTokens: null,
    completionTokens: null,
    tokensEstimated: null,
    createdAt,
  };
  conversation.messages.push(message);
  conversation.lastMessageAt = createdAt;
  return message;
}

/** Mimics the API's chat endpoint: saves the messages and streams the answer as SSE. */
function streamExchange(conversation: ConversationDetail, content: string, script: ChatScript) {
  let sent = '';
  let cancelled = false;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    async start(controller) {
      if (script.raw) {
        for (const chunk of script.raw) controller.enqueue(encoder.encode(chunk));
        controller.close();
        return;
      }

      if (conversation.title === DEFAULT_TITLE) conversation.title = content.slice(0, 50);
      const userMessage = saveMessage(conversation, 'user', content);
      controller.enqueue(
        sseChunk({ type: 'start', conversation: withoutMessages(conversation), userMessage }),
      );

      const answer = script.error
        ? (script.error.partial ?? '')
        : (script.answer ?? `Réponse à : ${content}`);
      const words = answer.match(/\S+\s*/g) ?? [];
      for (const [index, word] of words.entries()) {
        controller.enqueue(sseChunk({ type: 'delta', content: word }));
        sent += word;
        if (index === 0 && script.hold) await script.hold.catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
      }

      if (script.error) {
        const partial = answer ? saveMessage(conversation, 'assistant', answer, true) : null;
        controller.enqueue(
          sseChunk({
            type: 'error',
            code: script.error.code,
            message: 'Generic error',
            assistantMessage: partial,
          }),
        );
      } else {
        const assistantMessage = saveMessage(conversation, 'assistant', answer);
        controller.enqueue(sseChunk({ type: 'done', assistantMessage }));
      }
      controller.close();
    },
    // Client gone (stop button): like the API, keep what was generated as interrupted.
    cancel() {
      cancelled = true;
      if (sent) saveMessage(conversation, 'assistant', sent, true);
    },
  });
}

handlers.push(
  http.patch('/api/conversations/:id', async ({ params, request }) => {
    if (!backend.loggedIn) return unauthorized();
    const conversation = backend.findConversation(String(params['id']));
    if (!conversation) return notFound();
    const body: unknown = await request.json();
    const parsed = renameBodySchema.safeParse(body);
    if (!parsed.success) return new HttpResponse(null, { status: 400 });
    conversation.title = parsed.data.title;
    conversation.updatedAt = new Date().toISOString();
    return HttpResponse.json(withoutMessages(conversation));
  }),

  http.delete('/api/conversations/:id', ({ params }) => {
    if (!backend.loggedIn) return unauthorized();
    const id = String(params['id']);
    if (!backend.findConversation(id)) return notFound();
    backend.conversations = backend.conversations.filter((conversation) => conversation.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/conversations', () => {
    if (!backend.loggedIn) return unauthorized();
    return HttpResponse.json(withoutMessages(backend.addConversation()), { status: 201 });
  }),

  http.post('/api/conversations/:id/messages', async ({ params, request }) => {
    if (!backend.loggedIn) return unauthorized();
    backend.sendRequests += 1;
    const conversation = backend.findConversation(String(params['id']));
    if (!conversation) return notFound();
    const body: unknown = await request.json();
    const { content } = sendBodySchema.parse(body);
    if (content.trim() === '') return new HttpResponse(null, { status: 400 });

    return new HttpResponse(streamExchange(conversation, content.trim(), backend.chat), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    });
  }),
);

export const server = setupServer(...handlers);
