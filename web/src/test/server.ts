import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import type { ChatErrorCode, ChatEvent } from '@/api/chat-events';
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
  loginRequests: 0,
  conversations: [] as ConversationDetail[],
  chat: {} as ChatScript,
  sendRequests: 0,

  reset() {
    this.loggedIn = false;
    this.loginRequests = 0;
    this.conversations = [];
    this.chat = {};
    this.sendRequests = 0;
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
