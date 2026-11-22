import { z } from 'zod';

import { conversationSchema, messageSchema } from '../conversations/conversations.schemas.js';

// --- Request -----------------------------------------------------------------------------

/**
 * The maximum length comes from the configuration (MAX_MESSAGE_LENGTH), so the runtime
 * schema is built by `SendMessagePipe`; this one, without the limit, documents the contract.
 */
export function createSendMessageSchema(maxLength?: number) {
  const content = z.string().trim().min(1);
  return z.object({ content: maxLength === undefined ? content : content.max(maxLength) });
}

export const sendMessageDocSchema = createSendMessageSchema().meta({
  id: 'SendMessageRequest',
  description: 'At most MAX_MESSAGE_LENGTH characters (default 32000) once trimmed.',
});

export type SendMessageInput = z.infer<ReturnType<typeof createSendMessageSchema>>;

// --- Server-sent events --------------------------------------------------------------------
// Source of truth of the SSE contract: the web client keeps a copy of these schemas
// (web/src/api/chat-events.ts) and validates every event it receives.

export const CHAT_ERROR_CODES = [
  'LLM_UNAVAILABLE',
  'LLM_TIMEOUT',
  'LLM_ERROR',
  'INTERNAL',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/** Generic, user-safe messages: provider error details are only logged. */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  LLM_UNAVAILABLE: 'The language model server is unreachable',
  LLM_TIMEOUT: 'The language model took too long to respond',
  LLM_ERROR: 'The language model returned an error',
  INTERNAL: 'An unexpected error occurred',
};

/** First event: the user message is saved (the conversation may have been auto-titled). */
export const chatStartEventSchema = z
  .object({
    type: z.literal('start'),
    conversation: conversationSchema,
    userMessage: messageSchema,
  })
  .meta({ id: 'ChatStartEvent' });

/** A piece of the answer, to append to the previous ones. */
export const chatDeltaEventSchema = z
  .object({ type: z.literal('delta'), content: z.string() })
  .meta({ id: 'ChatDeltaEvent' });

/** Last event on success: the complete answer as saved. */
export const chatDoneEventSchema = z
  .object({ type: z.literal('done'), assistantMessage: messageSchema })
  .meta({ id: 'ChatDoneEvent' });

/**
 * Last event on failure. The user message stays saved; `assistantMessage` is the partial
 * answer (saved with `interrupted: true`), or null when nothing was generated.
 */
export const chatErrorEventSchema = z
  .object({
    type: z.literal('error'),
    code: z.enum(CHAT_ERROR_CODES),
    message: z.string(),
    assistantMessage: messageSchema.nullable(),
  })
  .meta({ id: 'ChatErrorEvent' });

export const chatEventSchema = z
  .discriminatedUnion('type', [
    chatStartEventSchema,
    chatDeltaEventSchema,
    chatDoneEventSchema,
    chatErrorEventSchema,
  ])
  .meta({ id: 'ChatEvent' });

export type ChatEvent = z.input<typeof chatEventSchema>;
