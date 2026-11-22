import { z } from 'zod';

import type { components } from './schema';

/*
 * Copy of the SSE contract of POST /api/conversations/:id/messages.
 * Source of truth: api/src/chat/chat.schemas.ts (and the conversation and message schemas in
 * api/src/conversations/conversations.schemas.ts). Keep both in sync: the type check at the
 * bottom of this file fails as soon as this copy and the generated OpenAPI types diverge.
 *
 * Differences with the API side: dates travel as ISO strings in JSON.
 */

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  interrupted: z.boolean(),
  createdAt: z.iso.datetime(),
});

const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
});

export const CHAT_ERROR_CODES = [
  'LLM_UNAVAILABLE',
  'LLM_TIMEOUT',
  'LLM_ERROR',
  'INTERNAL',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/** First event: the user message is saved (the conversation may have been auto-titled). */
const chatStartEventSchema = z.object({
  type: z.literal('start'),
  conversation: conversationSchema,
  userMessage: messageSchema,
});

/** A piece of the answer, to append to the previous ones. */
const chatDeltaEventSchema = z.object({ type: z.literal('delta'), content: z.string() });

/** Last event on success: the complete answer as saved. */
const chatDoneEventSchema = z.object({ type: z.literal('done'), assistantMessage: messageSchema });

/** Last event on failure; `assistantMessage` is the partial answer saved, if any. */
const chatErrorEventSchema = z.object({
  type: z.literal('error'),
  code: z.enum(CHAT_ERROR_CODES),
  message: z.string(),
  assistantMessage: messageSchema.nullable(),
});

export const chatEventSchema = z.discriminatedUnion('type', [
  chatStartEventSchema,
  chatDeltaEventSchema,
  chatDoneEventSchema,
  chatErrorEventSchema,
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;

// --- Contract check (compile time only) ----------------------------------------------------

// The generic functions only exist to compare A and B exactly (the usual type-equality idiom).
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
type Assert<T extends true> = T;

/** Fails to compile when this copy no longer matches `ChatEvent` in api/openapi.json. */
type _ChatEventMatchesContract = Assert<Equals<ChatEvent, components['schemas']['ChatEvent']>>;
