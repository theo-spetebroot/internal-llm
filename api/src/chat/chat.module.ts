import { Module } from '@nestjs/common';

import { ConversationsModule } from '../conversations/conversations.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ConversationLocks } from './conversation-locks.js';

@Module({
  imports: [ConversationsModule, LlmModule],
  controllers: [ChatController],
  providers: [ChatService, ConversationLocks],
})
export class ChatModule {}
