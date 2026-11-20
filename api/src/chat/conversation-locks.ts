import { Injectable } from '@nestjs/common';

/**
 * Conversations currently generating an answer. Prevents two answers from interleaving in
 * the same history. In memory: enough for the single API instance this app runs.
 */
@Injectable()
export class ConversationLocks {
  private readonly busy = new Set<string>();

  /** False when the conversation is already locked. */
  tryAcquire(conversationId: string): boolean {
    if (this.busy.has(conversationId)) return false;
    this.busy.add(conversationId);
    return true;
  }

  release(conversationId: string): void {
    this.busy.delete(conversationId);
  }
}
