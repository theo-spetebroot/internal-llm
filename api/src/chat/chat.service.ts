import { Injectable, Logger } from '@nestjs/common';

import {
  type ConversationDto,
  DEFAULT_CONVERSATION_TITLE,
  type MessageDto,
} from '../conversations/conversations.schemas.js';
import {
  conversationSelect,
  messageSelect,
  toMessageDto,
} from '../conversations/message.mapper.js';
import { MessageRole } from '../generated/prisma/enums.js';
import { LlmError } from '../llm/llm.errors.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmMessage } from '../llm/llm.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAT_ERROR_MESSAGES, type ChatErrorCode, type ChatEvent } from './chat.schemas.js';
import { titleFromMessage } from './conversation-title.js';

export interface SavedUserMessage {
  conversation: ConversationDto;
  userMessage: MessageDto;
  /** Whole conversation, oldest first, ending with the new message: what the LLM receives. */
  history: LlmMessage[];
}

/**
 * Sends a message in a conversation: persists both sides of the exchange and turns the
 * LLM output into chat events. Ownership is checked by the caller beforehand.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Saves the user message, bumps `lastMessageAt` and, for the first message of a
   * conversation still bearing the default title, derives its title from the message.
   */
  saveUserMessage(conversationId: string, content: string): Promise<SavedUserMessage> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: { conversationId, role: MessageRole.USER, content, createdAt: now },
        select: messageSelect,
      });

      const isFirstMessage = (await tx.message.count({ where: { conversationId } })) === 1;
      if (isFirstMessage) {
        // Conditional update: a title chosen by the user is never overwritten.
        await tx.conversation.updateMany({
          where: { id: conversationId, title: DEFAULT_CONVERSATION_TITLE },
          data: { title: titleFromMessage(content) },
        });
      }

      const conversation = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
        select: conversationSelect,
      });
      const messages = await tx.message.findMany({
        where: { conversationId },
        select: messageSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      return {
        conversation,
        userMessage: toMessageDto(userMessage),
        history: messages.map(toMessageDto).map(({ role, content }) => ({ role, content })),
      };
    });
  }

  /**
   * Streams the answer as `delta` events, then saves it and ends with `done`.
   * On failure, the partial answer (if any) is saved as interrupted and an `error` event
   * ends the stream; when the client is gone (`signal` aborted), nothing more is emitted.
   */
  async *answer(
    conversationId: string,
    history: LlmMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    let content = '';
    try {
      for await (const delta of this.llm.generate(history, signal)) {
        content += delta;
        yield { type: 'delta', content: delta };
      }
    } catch (error) {
      const partial =
        content === '' ? null : await this.saveAssistantMessage(conversationId, content, true);
      if (signal.aborted) return;

      const code = this.toErrorCode(error);
      yield { type: 'error', code, message: CHAT_ERROR_MESSAGES[code], assistantMessage: partial };
      return;
    }

    const assistantMessage = await this.saveAssistantMessage(conversationId, content, false);
    yield { type: 'done', assistantMessage };
  }

  private async saveAssistantMessage(
    conversationId: string,
    content: string,
    interrupted: boolean,
  ): Promise<MessageDto> {
    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, role: MessageRole.ASSISTANT, content, interrupted, createdAt: now },
        select: messageSelect,
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
    ]);
    return toMessageDto(message);
  }

  private toErrorCode(error: unknown): ChatErrorCode {
    if (error instanceof LlmError && error.code !== 'LLM_ABORTED') {
      this.logger.warn(`LLM failure (${error.code}): ${error.message}`);
      return error.code;
    }
    this.logger.error('Unexpected failure while generating an answer', error);
    return 'INTERNAL';
  }
}
