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
    createdAt: z.date(),
  })
  .meta({ id: 'Message' });

export type MessageDto = z.infer<typeof messageSchema>;

export const conversationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Conversation' });

export type ConversationDto = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema
  .extend({ messages: z.array(messageSchema) })
  .meta({ id: 'ConversationDetail' });

export type ConversationDetailDto = z.infer<typeof conversationDetailSchema>;
