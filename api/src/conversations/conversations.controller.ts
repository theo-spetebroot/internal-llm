import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';

import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ZodBody, ZodResponse } from '../common/zod/zod.decorators.js';
import type { UserDto } from '../users/users.schemas.js';
import {
  type ConversationDetailDto,
  conversationDetailSchema,
  type ConversationDto,
  conversationSchema,
  type CreateConversationInput,
  createConversationSchema,
  type UpdateConversationInput,
  updateConversationSchema,
} from './conversations.schemas.js';
import { ConversationsService } from './conversations.service.js';

const NOT_FOUND = 'No such conversation for this user';

@ApiTags('conversations')
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: "The user's conversations, most recently active first",
    schema: z.array(conversationSchema),
  })
  list(@CurrentUser() user: UserDto): Promise<ConversationDto[]> {
    return this.conversations.list(user.id);
  }

  @Post()
  @ZodResponse({ status: 201, description: 'Conversation created', schema: conversationSchema })
  @ZodResponse({ status: 400, description: 'Malformed request body' })
  create(
    @CurrentUser() user: UserDto,
    @ZodBody(createConversationSchema) input: CreateConversationInput,
  ): Promise<ConversationDto> {
    return this.conversations.create(user.id, input);
  }

  @Get(':id')
  @ZodResponse({
    status: 200,
    description: 'The conversation and its messages, oldest first',
    schema: conversationDetailSchema,
  })
  @ZodResponse({ status: 404, description: NOT_FOUND })
  findOne(@CurrentUser() user: UserDto, @Param('id') id: string): Promise<ConversationDetailDto> {
    return this.conversations.findOne(user.id, id);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, description: 'Conversation renamed', schema: conversationSchema })
  @ZodResponse({ status: 400, description: 'Malformed request body' })
  @ZodResponse({ status: 404, description: NOT_FOUND })
  rename(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @ZodBody(updateConversationSchema) input: UpdateConversationInput,
  ): Promise<ConversationDto> {
    return this.conversations.rename(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ZodResponse({ status: 204, description: 'Conversation and its messages deleted' })
  @ZodResponse({ status: 404, description: NOT_FOUND })
  remove(@CurrentUser() user: UserDto, @Param('id') id: string): Promise<void> {
    return this.conversations.remove(user.id, id);
  }
}
