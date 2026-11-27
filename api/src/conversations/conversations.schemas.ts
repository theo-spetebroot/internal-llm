import { z } from 'zod';

/** Title given to a conversation until it is renamed (manually or from its first message). */
export const DEFAULT_CONVERSATION_TITLE = 'Nouvelle conversation';

export const CONVERSATION_TITLE_MAX_LENGTH = 200;

const titleSchema = z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH);

/** The body itself is optional: Express leaves `req.body` undefined when none is sent. */
export const createConversationSchema = z
  .object({ title: titleSchema.optional() })
  .default({})
  .meta({ id: 'CreateConversationRequest' });

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z
  .object({ title: titleSchema })
  .meta({ id: 'UpdateConversationRequest' });

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const messageRoleSchema = z
  .enum(['user', 'assistant', 'system'])
  .meta({ id: 'MessageRole' });

export type MessageRoleDto = z.infer<typeof messageRoleSchema>;

export const messageSchema = z
  .object({
    id: z.string(),
    role: messageRoleSchema,
    content: z.string(),
    /** True when the answer was cut short (client gone, LLM failure mid-stream). */
    interrupted: z.boolean(),
    /** Tokens of the prompt sent to the model; null on messages that are not model answers. */
    promptTokens: z.number().int().nullable(),
    /** Tokens of the answer; null on messages that are not model answers. */
    completionTokens: z.number().int().nullable(),
    /** True when the token counts are estimated, false when the provider reported them. */
    tokensEstimated: z.boolean().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'Message' });

export type MessageDto = z.infer<typeof messageSchema>;

export const conversationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.date(),
    /** Last modification of the conversation itself (e.g. rename). */
    updatedAt: z.date(),
    /** Last message sent or received (`createdAt` until then); orders the conversation list. */
    lastMessageAt: z.date(),
  })
  .meta({ id: 'Conversation' });

export type ConversationDto = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema
  .extend({ messages: z.array(messageSchema) })
  .meta({ id: 'ConversationDetail' });

export type ConversationDetailDto = z.infer<typeof conversationDetailSchema>;
