import { useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/api/client';
import type { components } from '@/api/schema';

export type Conversation = components['schemas']['Conversation'];
export type ConversationDetail = components['schemas']['ConversationDetail'];
export type Message = components['schemas']['Message'];

export const conversationKeys = {
  all: ['conversations'] as const,
  list: () => [...conversationKeys.all, 'list'] as const,
  detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
};

/** The user's conversations, most recently active first (ordered by the API). */
export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.list(),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, response } = await api.GET('/api/conversations');
      if (!data) throw new ApiError(response.status);
      return data;
    },
  });
}

/** One conversation with its messages, or null when it does not exist for this user. */
export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: async (): Promise<ConversationDetail | null> => {
      const { data, response } = await api.GET('/api/conversations/{id}', {
        params: { path: { id } },
      });
      // Another user's conversation also answers 404: it is simply "not found" here.
      if (response.status === 404) return null;
      if (!data) throw new ApiError(response.status);
      return data;
    },
  });
}
