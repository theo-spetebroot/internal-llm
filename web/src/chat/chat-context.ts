import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import type { ChatStore, Exchange } from './chat-store';

export const ChatStoreContext = createContext<ChatStore | null>(null);

export function useChatStore(): ChatStore {
  const store = useContext(ChatStoreContext);
  if (!store) throw new Error('useChatStore must be used inside the app shell');
  return store;
}

/** The exchange in progress (or failed) in a conversation, updated live. */
export function useExchange(conversationId: string): Exchange | undefined {
  const store = useChatStore();
  const getSnapshot = useCallback(() => store.get(conversationId), [store, conversationId]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
