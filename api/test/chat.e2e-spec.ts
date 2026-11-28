import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONVERSATION_TITLE } from '../src/conversations/conversations.schemas.js';
import { sleep } from '../src/llm/abort.utils.js';
import { LlmCallRecorder } from '../src/llm/llm-call.recorder.js';
import { LLM_OPTIONS, LLM_PROVIDER, type LlmOptions } from '../src/llm/llm.service.js';
import type {
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmRequestOptions,
  LlmUsage,
} from '../src/llm/llm.types.js';
import { MOCK_ERROR_TRIGGER, MockLlmProvider } from '../src/llm/providers/mock.provider.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestUser, loginAs } from './helpers/auth.js';
import { eventsOfType, parseSse } from './helpers/sse.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app.js';

/** Mock answers with a configurable pace, recording what the LLM receives. */
class RecordingProvider implements LlmProvider {
  readonly name = 'recording';
  readonly calls: LlmMessage[][] = [];
  tokenDelayMs = 0;
  /** Usage reported with every complete answer, like a provider that knows the real figures. */
  reportedUsage: LlmUsage | undefined;
  private readonly mock = new MockLlmProvider({ tokenDelayMs: { min: 0, max: 0 } });

  async chat(messages: LlmMessage[], options: LlmRequestOptions): Promise<LlmChatResult> {
    this.calls.push(messages);
    const { text } = await this.mock.chat(messages, options);
    return { text, usage: this.reportedUsage };
  }

  async *chatStream(
    messages: LlmMessage[],
    options: LlmRequestOptions,
  ): AsyncGenerator<string, LlmUsage | undefined> {
    this.calls.push(messages);
    for await (const token of this.mock.chatStream(messages, options)) {
      await sleep(this.tokenDelayMs, options.signal);
      yield token;
    }
    return this.reportedUsage;
  }
}

const llmOptions: LlmOptions = { stream: true, timeoutMs: 5_000 };

describe('Chat (e2e)', () => {
  const provider = new RecordingProvider();
  let testApp: TestApp;
  let http: Server;
  let prisma: PrismaService;
  let cookie: string;
  let conversationId: string;

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(provider)
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
    provider.calls.length = 0;
    provider.tokenDelayMs = 0;
    provider.reportedUsage = undefined;
    llmOptions.stream = true;
    cookie = await loginAs(http, await createTestUser(prisma, 'Alice'));
    const response = await request(http)
      .post('/api/conversations')
      .set('Cookie', cookie)
      .expect(201);
    conversationId = (response.body as { id: string }).id;
  });

  function send(content: string, as = cookie, id = conversationId) {
    return request(http)
      .post(`/api/conversations/${id}/messages`)
      .set('Cookie', as)
      .send({ content });
  }

  async function sendAndParse(content: string) {
    const response = await send(content)
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    return parseSse(response.text);
  }

  async function storedMessages() {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  describe('streaming answer', () => {
    it('emits start, many deltas, then done, and stores both messages', async () => {
      const events = await sendAndParse('Hello mock');

      expect(events[0]).toMatchObject({
        type: 'start',
        userMessage: { role: 'user', content: 'Hello mock', interrupted: false },
      });
      const deltas = eventsOfType(events, 'delta');
      expect(deltas.length).toBeGreaterThan(10);
      const done = events.at(-1);
      expect(done?.type).toBe('done');

      const answer = deltas.map((delta) => delta.content).join('');
      expect(done).toMatchObject({
        assistantMessage: { role: 'assistant', content: answer, interrupted: false },
      });

      const stored = await storedMessages();
      expect(
        stored.map(({ role, content, interrupted }) => ({ role, content, interrupted })),
      ).toEqual([
        { role: 'USER', content: 'Hello mock', interrupted: false },
        { role: 'ASSISTANT', content: answer, interrupted: false },
      ]);
    });

    it('sends the whole conversation history to the LLM', async () => {
      await sendAndParse('first');
      await sendAndParse('second');

      const lastCall = provider.calls.at(-1) ?? [];
      expect(lastCall.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
      expect(lastCall[0]?.content).toBe('first');
      expect(lastCall[2]?.content).toBe('second');
    });

    it('emits a single delta when streaming is disabled', async () => {
      llmOptions.stream = false;
      const events = await sendAndParse('Hello');

      expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'done']);
    });
  });

  describe('token usage', () => {
    it('stores estimated token counts on the assistant message only', async () => {
      const events = await sendAndParse('a'.repeat(40));
      const answer = eventsOfType(events, 'delta')
        .map((delta) => delta.content)
        .join('');

      const [user, assistant] = await storedMessages();
      expect(user).toMatchObject({
        promptTokens: null,
        completionTokens: null,
        tokensEstimated: null,
      });
      const expected = {
        // The whole prompt sent to the model: here a single 40-character message.
        promptTokens: 10,
        completionTokens: Math.ceil(answer.length / 4),
        tokensEstimated: true,
      };
      expect(assistant).toMatchObject(expected);
      // The same figures reach the client in the `done` event.
      expect(events.at(-1)).toMatchObject({ type: 'done', assistantMessage: expected });
    });

    it('stores the figures reported by the provider instead of an estimate', async () => {
      provider.reportedUsage = { promptTokens: 123, completionTokens: 45 };
      await sendAndParse('Hello');

      const assistant = (await storedMessages())[1];
      expect(assistant).toMatchObject({
        promptTokens: 123,
        completionTokens: 45,
        tokensEstimated: false,
      });
    });

    it('stores the reported figures when streaming is disabled', async () => {
      llmOptions.stream = false;
      provider.reportedUsage = { promptTokens: 7, completionTokens: 8 };
      await sendAndParse('Hello');

      expect((await storedMessages())[1]).toMatchObject({
        promptTokens: 7,
        completionTokens: 8,
        tokensEstimated: false,
      });
    });

    it('estimates the usage of a partial answer', async () => {
      // Whatever the provider reports, an answer cut short never completed its report.
      provider.reportedUsage = { promptTokens: 999, completionTokens: 999 };
      const events = await sendAndParse(`Break ${MOCK_ERROR_TRIGGER}`);
      const partial = eventsOfType(events, 'delta')
        .map((delta) => delta.content)
        .join('');

      const assistant = (await storedMessages())[1];
      expect(assistant).toMatchObject({
        interrupted: true,
        completionTokens: Math.ceil(partial.length / 4),
        tokensEstimated: true,
      });
      expect(assistant?.promptTokens).toBe(Math.ceil(`Break ${MOCK_ERROR_TRIGGER}`.length / 4));
    });
  });

  describe('conversation metadata', () => {
    it('titles the conversation after its first message only', async () => {
      const [start] = await sendAndParse('Comment configurer   nginx pour du SSE ?');
      expect(start).toMatchObject({
        conversation: { title: 'Comment configurer nginx pour du SSE ?' },
      });

      await sendAndParse('Autre question');
      const stored = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      expect(stored.title).toBe('Comment configurer nginx pour du SSE ?');
    });

    it('never overwrites a title chosen by the user', async () => {
      await request(http)
        .patch(`/api/conversations/${conversationId}`)
        .set('Cookie', cookie)
        .send({ title: 'Mon titre' })
        .expect(200);

      const [start] = await sendAndParse('Hello');
      expect(start).toMatchObject({ conversation: { title: 'Mon titre' } });
    });

    it('moves lastMessageAt to the assistant message', async () => {
      const events = await sendAndParse('Hello');
      const done = eventsOfType(events, 'done')[0];

      const stored = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      expect(stored.title).not.toBe(DEFAULT_CONVERSATION_TITLE);
      expect(stored.lastMessageAt.toISOString()).toBe(done?.assistantMessage.createdAt);
    });
  });

  describe('failures', () => {
    it('ends with an error event and keeps the partial answer as interrupted', async () => {
      const events = await sendAndParse(`Break ${MOCK_ERROR_TRIGGER}`);

      const error = events.at(-1);
      expect(error).toMatchObject({
        type: 'error',
        code: 'LLM_ERROR',
        message: 'The language model returned an error',
        assistantMessage: { role: 'assistant', interrupted: true },
      });
      expect(eventsOfType(events, 'done')).toEqual([]);

      const stored = await storedMessages();
      expect(stored.map(({ role, interrupted }) => ({ role, interrupted }))).toEqual([
        { role: 'USER', interrupted: false },
        { role: 'ASSISTANT', interrupted: true },
      ]);
      const partial = eventsOfType(events, 'delta')
        .map((delta) => delta.content)
        .join('');
      expect(stored[1]?.content).toBe(partial);
    });

    it('saves the partial answer as interrupted when the client disconnects', async () => {
      provider.tokenDelayMs = 20;
      const firstDelta = await openStreamAndDisconnect();
      expect(firstDelta).toContain('event: ');

      const assistant = await waitFor(async () =>
        (await storedMessages()).find((message) => message.role === 'ASSISTANT'),
      );
      expect(assistant.interrupted).toBe(true);
      expect(assistant.content.length).toBeGreaterThan(0);
    });
  });

  describe('call records', () => {
    /** Records are written in the background: flush them before reading. */
    async function callRecords() {
      await testApp.app.get(LlmCallRecorder).flush();
      return prisma.llmCall.findMany({ orderBy: { startedAt: 'asc' } });
    }

    it('writes one completed record per exchange, for the sender', async () => {
      await sendAndParse('Hello');

      const records = await callRecords();
      const alice = await prisma.user.findFirstOrThrow();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        userId: alice.id,
        conversationId,
        provider: 'recording',
        outcome: 'COMPLETED',
        errorCode: null,
      });
      expect(records[0]?.timeToFirstTokenMs).toEqual(expect.any(Number));
    });

    it('stores the estimated token usage on the record, like on the answer', async () => {
      const events = await sendAndParse('a'.repeat(40));
      const answer = eventsOfType(events, 'delta')
        .map((delta) => delta.content)
        .join('');

      const [record] = await callRecords();
      expect(record).toMatchObject({
        promptTokens: 10,
        completionTokens: Math.ceil(answer.length / 4),
        tokensEstimated: true,
      });
      const assistant = (await storedMessages())[1];
      expect(assistant).toMatchObject({
        promptTokens: record?.promptTokens,
        completionTokens: record?.completionTokens,
        tokensEstimated: record?.tokensEstimated,
      });
    });

    it('stores the usage reported by the provider on the record', async () => {
      provider.reportedUsage = { promptTokens: 123, completionTokens: 45 };
      await sendAndParse('Hello');

      expect(await callRecords()).toMatchObject([
        { promptTokens: 123, completionTokens: 45, tokensEstimated: false },
      ]);
    });

    it('estimates the usage of a partial answer on the record', async () => {
      provider.reportedUsage = { promptTokens: 999, completionTokens: 999 };
      const events = await sendAndParse(`Break ${MOCK_ERROR_TRIGGER}`);
      const partial = eventsOfType(events, 'delta')
        .map((delta) => delta.content)
        .join('');

      expect(await callRecords()).toMatchObject([
        {
          outcome: 'ERROR',
          promptTokens: Math.ceil(`Break ${MOCK_ERROR_TRIGGER}`.length / 4),
          completionTokens: Math.ceil(partial.length / 4),
          tokensEstimated: true,
        },
      ]);
    });

    it('writes one record for each exchange', async () => {
      await sendAndParse('first');
      await sendAndParse('second');

      expect(await callRecords()).toHaveLength(2);
    });

    it('records a provider failure as ERROR with its code', async () => {
      await sendAndParse(`Break ${MOCK_ERROR_TRIGGER}`);

      expect(await callRecords()).toMatchObject([{ outcome: 'ERROR', errorCode: 'LLM_ERROR' }]);
    });

    it('records a client disconnect as INTERRUPTED', async () => {
      provider.tokenDelayMs = 20;
      await openStreamAndDisconnect();

      const record = await waitFor(async () => (await prisma.llmCall.findFirst()) ?? undefined);
      expect(record).toMatchObject({ outcome: 'INTERRUPTED', errorCode: null });
    });

    it('keeps the records when the conversation is deleted, unlinked from it', async () => {
      await sendAndParse('Hello');
      await request(http)
        .delete(`/api/conversations/${conversationId}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(await callRecords()).toMatchObject([{ conversationId: null, outcome: 'COMPLETED' }]);
    });
  });

  describe('validation and access', () => {
    it('rejects an empty or too long message', async () => {
      await send('   ').expect(400);
      await send('x'.repeat(101)).expect(400); // MAX_MESSAGE_LENGTH is 100 in tests
      expect(await storedMessages()).toEqual([]);
    });

    it("answers 404 for another user's conversation, without storing anything", async () => {
      const bobCookie = await loginAs(http, await createTestUser(prisma, 'Bob'));
      await send('Hello', bobCookie).expect(404);
      expect(await storedMessages()).toEqual([]);
    });

    it('requires a session', async () => {
      await request(http)
        .post(`/api/conversations/${conversationId}/messages`)
        .send({ content: 'Hello' })
        .expect(401);
    });

    it('answers 409 while an answer is being generated in the same conversation', async () => {
      provider.tokenDelayMs = 20;
      // supertest requests are lazy: `then` actually sends this one, without awaiting it.
      const pending = send('first')
        .expect(200)
        .then(() => undefined);
      await waitFor(async () => (await storedMessages()).length > 0);

      await send('second').expect(409);
      await pending;
      await send('third').expect(200);
    });
  });

  /**
   * Opens a raw HTTP stream, waits for the first chunk after `start` and drops the
   * connection, like a browser tab being closed. Returns that chunk.
   */
  async function openStreamAndDisconnect(): Promise<string> {
    if (!http.listening) await new Promise<void>((resolve) => http.listen(0, resolve));
    const { port } = http.address() as AddressInfo;

    return new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        {
          port,
          method: 'POST',
          path: `/api/conversations/${conversationId}/messages`,
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        },
        (res) => {
          let received = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            received += chunk;
            if (received.includes('event: delta')) {
              req.destroy();
              resolve(received);
            }
          });
        },
      );
      req.on('error', (error) => {
        if (!req.destroyed) reject(error);
      });
      req.end(JSON.stringify({ content: 'Tell me a long story' }));
    });
  }
});

/** Polls `probe` until it returns a value (max ~5 s). */
async function waitFor<T>(probe: () => Promise<T | undefined | false>): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await probe();
    if (value !== undefined && value !== false) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Condition not met in time');
}
