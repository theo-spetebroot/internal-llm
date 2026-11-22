import { MessageRole } from '../generated/prisma/enums.js';
import type { MessageDto, MessageRoleDto } from './conversations.schemas.js';

/** Columns exposed by the API for a message. */
export const messageSelect = {
  id: true,
  role: true,
  content: true,
  interrupted: true,
  createdAt: true,
} as const;

export const conversationSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
} as const;

const roleToDto: Record<MessageRole, MessageRoleDto> = {
  [MessageRole.USER]: 'user',
  [MessageRole.ASSISTANT]: 'assistant',
  [MessageRole.SYSTEM]: 'system',
};

interface MessageRow {
  id: string;
  role: MessageRole;
  content: string;
  interrupted: boolean;
  createdAt: Date;
}

/** Database roles are upper-case enum values; the API exposes them in lower case. */
export function toMessageDto(message: MessageRow): MessageDto {
  return { ...message, role: roleToDto[message.role] };
}
