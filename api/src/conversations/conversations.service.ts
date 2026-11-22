import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  type ConversationDetailDto,
  type ConversationDto,
  type CreateConversationInput,
  DEFAULT_CONVERSATION_TITLE,
  type UpdateConversationInput,
} from './conversations.schemas.js';
import { conversationSelect, messageSelect, toMessageDto } from './message.mapper.js';

/**
 * Every query is scoped by `userId`: a conversation owned by someone else is reported as
 * not found (404), so that its existence is never disclosed.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Most recently active (last message) first; renaming does not change the order. */
  list(userId: string): Promise<ConversationDto[]> {
    return this.prisma.conversation.findMany({
      where: { userId },
      select: conversationSelect,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
  }

  create(userId: string, input: CreateConversationInput): Promise<ConversationDto> {
    const now = new Date();
    return this.prisma.conversation.create({
      data: {
        userId,
        title: input.title ?? DEFAULT_CONVERSATION_TITLE,
        createdAt: now,
        lastMessageAt: now,
      },
      select: conversationSelect,
    });
  }

  /** The conversation without its messages; 404 when it does not belong to the user. */
  async findOwned(userId: string, id: string): Promise<ConversationDto> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: conversationSelect,
    });
    if (!conversation) throw conversationNotFound();
    return conversation;
  }

  /** The conversation with its messages in chronological order. */
  async findOne(userId: string, id: string): Promise<ConversationDetailDto> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        ...conversationSelect,
        messages: { select: messageSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!conversation) throw conversationNotFound();

    return { ...conversation, messages: conversation.messages.map(toMessageDto) };
  }

  async rename(
    userId: string,
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationDto> {
    const [conversation] = await this.prisma.conversation.updateManyAndReturn({
      where: { id, userId },
      data: { title: input.title },
      select: conversationSelect,
    });
    if (!conversation) throw conversationNotFound();
    return conversation;
  }

  /** Messages are deleted along with the conversation (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.conversation.deleteMany({ where: { id, userId } });
    if (count === 0) throw conversationNotFound();
  }
}

function conversationNotFound(): NotFoundException {
  return new NotFoundException('Conversation not found');
}
