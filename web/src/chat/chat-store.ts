import { notifyManager, type QueryClient } from '@tanstack/react-query';

import { readChatEvents } from '@/api/chat-stream';
import { conversationKeys, type Message } from '@/conversations/conversations-api';

import { BROKEN_STREAM_MESSAGE, CHAT_ERROR_MESSAGES, SEND_FAILURE_MESSAGES } from './chat-errors';
import { appendMessages, upsertConversation } from './conversation-cache';
import { SendMessageError, openChatStream } from './send-message';

/**
 * The exchange in progress in a conversation, until its messages are saved in the query cache.
 * - `sending`: posted, waiting for the `start` event (the user message shows optimistically);
 * - `streaming`: the answer is arriving;
 * - `failed`: nothing in progress any more, `error` explains what went wrong.
 */
export interface Exchange {
  status: 'sending' | 'streaming' | 'failed';
  userContent: string;
  /** The user message as saved (from the `start` event). */
  userMessage: Message | null;
  /** The answer received so far. */
  answer: string;
  error: string | null;
  controller: AbortController;
}

/** Whether the message ended up saved: when it did not, the caller restores the draft. */
export type SendOutcome = 'saved' | 'not-saved';

/**
 * Runs the send/stream exchanges of all conversations, outside of the React tree: an answer
 * keeps streaming while the user navigates (e.g. from the home page to the new conversation).
 * Components read it with useSyncExternalStore.
 */
export class ChatStore {
  private readonly exchanges = new Map<string, Exchange>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly queryClient: QueryClient) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(conversationId: string): Exchange | undefined {
    return this.exchanges.get(conversationId);
  }

  isBusy(conversationId: string): boolean {
    const status = this.get(conversationId)?.status;
    return status === 'sending' || status === 'streaming';
  }

  /** Sends a message and streams the answer into the cache. Resolves once the exchange ends. */
  async send(conversationId: string, content: string): Promise<SendOutcome> {
    if (this.isBusy(conversationId)) return 'not-saved';

    let exchange: Exchange = {
      status: 'sending',
      userContent: content,
      userMessage: null,
      answer: '',
      error: null,
      controller: new AbortController(),
    };
    const update = (patch: Partial<Exchange>) => {
      exchange = { ...exchange, ...patch };
      this.set(conversationId, exchange);
    };
    const fail = (error: string) => {
      update({ status: 'failed', error, userMessage: null, answer: '' });
    };
    update({});

    let body: ReadableStream<Uint8Array<ArrayBuffer>>;
    try {
      body = await openChatStream(conversationId, content, exchange.controller.signal);
    } catch (error) {
      if (exchange.controller.signal.aborted) {
        // Stopped before the API answered: whether it saved the message is unknown.
        this.set(conversationId, undefined);
        void this.refresh();
        return 'saved';
      } else {
        const reason = error instanceof SendMessageError ? error.reason : 'unreachable';
        fail(SEND_FAILURE_MESSAGES[reason]);
        if (reason === 'not-found') void this.refresh();
      }
      return 'not-saved';
    }

    try {
      for await (const event of readChatEvents(body)) {
        switch (event.type) {
          case 'start':
            upsertConversation(this.queryClient, event.conversation);
            update({ status: 'streaming', userMessage: event.userMessage });
            break;
          case 'delta':
            update({ answer: exchange.answer + event.content });
            break;
          case 'done':
            this.settle(conversationId, exchange, event.assistantMessage);
            this.set(conversationId, undefined);
            return 'saved';
          case 'error':
            this.settle(conversationId, exchange, event.assistantMessage);
            fail(CHAT_ERROR_MESSAGES[event.code]);
            return 'saved';
        }
      }
      throw new Error('The answer stream ended before the last event');
    } catch {
      if (exchange.controller.signal.aborted) {
        this.keepStoppedAnswer(conversationId, exchange);
        return 'saved';
      }
      // Network failure or event outside the contract: what the API saved is unknown here,
      // so reload the conversation from it.
      const saved = exchange.userMessage !== null;
      fail(BROKEN_STREAM_MESSAGE);
      void this.refresh();
      return saved ? 'saved' : 'not-saved';
    }
  }

  /** Stops the answer being written in a conversation (the "Arrêter" button). */
  stop(conversationId: string): void {
    this.get(conversationId)?.controller.abort();
  }

  /** Aborts every exchange in progress (logout, end of the session). */
  abortAll(): void {
    for (const exchange of this.exchanges.values()) exchange.controller.abort();
  }

  /** Moves the saved user message and answer (if any) of an exchange into the cache. */
  private settle(conversationId: string, exchange: Exchange, answer: Message | null): void {
    const messages = [exchange.userMessage, answer].filter((message) => message !== null);
    appendMessages(this.queryClient, conversationId, messages);
  }

  /**
   * The user stopped the answer: the API saves what it generated as an interrupted answer
   * once it notices the disconnection. Show the received part the same way right away, and
   * only mark the cache stale: refetching now could run before the API has saved it.
   */
  private keepStoppedAnswer(conversationId: string, exchange: Exchange): void {
    const { userMessage, answer } = exchange;
    this.set(conversationId, undefined);
    if (!userMessage) {
      void this.refresh();
      return;
    }
    const partial: Message | null = answer
      ? {
          id: `local-${userMessage.id}`,
          role: 'assistant',
          content: answer,
          interrupted: true,
          // Unknown until the API has saved the answer and the conversation is reloaded.
          promptTokens: null,
          completionTokens: null,
          tokensEstimated: null,
          createdAt: new Date().toISOString(),
        }
      : null;
    this.settle(conversationId, exchange, partial);
    void this.queryClient.invalidateQueries({
      queryKey: conversationKeys.all,
      refetchType: 'none',
    });
  }

  private refresh(): Promise<void> {
    return this.queryClient.invalidateQueries({ queryKey: conversationKeys.all });
  }

  private set(conversationId: string, exchange: Exchange | undefined): void {
    if (exchange) this.exchanges.set(conversationId, exchange);
    else this.exchanges.delete(conversationId);
    // Notify through TanStack Query's scheduler, in the same flush as the query cache updates
    // made at the same time: when an exchange ends, its messages leave the store and enter
    // the cache in a single render (otherwise the answer would vanish for a frame).
    notifyManager.schedule(() => {
      for (const listener of this.listeners) listener();
    });
  }
}
