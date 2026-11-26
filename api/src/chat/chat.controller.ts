import { Body, ConflictException, Controller, Logger, Param, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { toOpenApiSchema } from '../common/zod/zod-openapi.js';
import { ZodResponse } from '../common/zod/zod.decorators.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import type { UserDto } from '../users/users.schemas.js';
import {
  CHAT_ERROR_MESSAGES,
  chatEventSchema,
  type SendMessageInput,
  sendMessageDocSchema,
} from './chat.schemas.js';
import { ChatService } from './chat.service.js';
import { ConversationLocks } from './conversation-locks.js';
import { SendMessagePipe } from './send-message.pipe.js';
import { SseWriter } from './sse-writer.js';

@ApiTags('conversations')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
@Controller('conversations/:id/messages')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
    private readonly locks: ConversationLocks,
  ) {}

  @Post()
  @ApiBody({ schema: toOpenApiSchema(sendMessageDocSchema, 'input') })
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'Server-sent events, each `data` being a JSON `ChatEvent`: `start`, then `delta`*, ' +
      'then `done` or `error`. Comment lines (`: ping`) are sent as heartbeats.',
    content: { 'text/event-stream': { schema: toOpenApiSchema(chatEventSchema, 'output') } },
  })
  @ZodResponse({ status: 400, description: 'Empty or too long message' })
  @ZodResponse({ status: 404, description: 'No such conversation for this user' })
  @ZodResponse({ status: 409, description: 'An answer is already being generated' })
  async send(
    @CurrentUser() user: UserDto,
    @Param('id') conversationId: string,
    @Body(SendMessagePipe) input: SendMessageInput,
    @Res() response: Response,
  ): Promise<void> {
    // Before the stream opens, failures are regular JSON errors (404, 409).
    await this.conversations.findOwned(user.id, conversationId);
    if (!this.locks.tryAcquire(conversationId)) {
      throw new ConflictException('An answer is already being generated for this conversation');
    }

    const sse = new SseWriter(response);
    const clientGone = new AbortController();
    response.on('close', () => {
      clientGone.abort();
    });

    try {
      const { conversation, userMessage, history } = await this.chat.saveUserMessage(
        conversationId,
        input.content,
      );
      sse.open();
      sse.send({ type: 'start', conversation, userMessage });

      for await (const event of this.chat.answer(
        user.id,
        conversationId,
        history,
        clientGone.signal,
      )) {
        sse.send(event);
      }
    } catch (error) {
      if (!sse.isOpen) throw error;
      this.logger.error('Chat stream failed', error);
      sse.send({
        type: 'error',
        code: 'INTERNAL',
        message: CHAT_ERROR_MESSAGES.INTERNAL,
        assistantMessage: null,
      });
    } finally {
      sse.close();
      this.locks.release(conversationId);
    }
  }
}
