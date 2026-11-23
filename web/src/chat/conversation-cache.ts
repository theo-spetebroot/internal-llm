import type { QueryClient } from '@tanstack/react-query';

import {
  conversationKeys,
  type Conversation,
  type ConversationDetail,
  type Message,
} from '@/conversations/conversations-api';

function byLastActivity(a: Conversation, b: Conversation): number {
  return b.lastMessageAt.localeCompare(a.lastMessageAt);
}

/** Puts a new or updated conversation (title, activity) in the cached list and detail. */
export function upsertConversation(queryClient: QueryClient, conversation: Conversation): void {
  queryClient.setQueryData<Conversation[]>(conversationKeys.list(), (list) =>
    list
      ? [conversation, ...list.filter(({ id }) => id !== conversation.id)].sort(byLastActivity)
      : list,
  );
  queryClient.setQueryData<ConversationDetail | null>(
    conversationKeys.detail(conversation.id),
    (detail) => (detail ? { ...detail, ...conversation } : detail),
  );
}

/** Appends saved messages to a cached conversation and moves it to the top of the list. */
export function appendMessages(
  queryClient: QueryClient,
  conversationId: string,
  messages: Message[],
): void {
  const last = messages.at(-1);
  if (!last) return;

  const detail = queryClient.getQueryData<ConversationDetail | null>(
    conversationKeys.detail(conversationId),
  );
  if (!detail) {
    // Not cached (anymore): the next read will get the messages from the API.
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    return;
  }

  const updated: ConversationDetail = {
    ...detail,
    lastMessageAt: last.createdAt,
    messages: [...detail.messages, ...messages],
  };
  queryClient.setQueryData(conversationKeys.detail(conversationId), updated);
  const { messages: _messages, ...conversation } = updated;
  upsertConversation(queryClient, conversation);
}
