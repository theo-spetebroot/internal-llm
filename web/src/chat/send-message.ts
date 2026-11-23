import { api } from '@/api/client';

/** Why a message could not be sent (before any event was received). */
export type SendFailure = 'busy' | 'invalid' | 'not-found' | 'unreachable' | 'server';

export class SendMessageError extends Error {
  constructor(
    readonly reason: SendFailure,
    options?: ErrorOptions,
  ) {
    super(`Message not sent: ${reason}`, options);
    this.name = 'SendMessageError';
  }
}

const FAILURE_BY_STATUS: Partial<Record<number, SendFailure>> = {
  400: 'invalid',
  404: 'not-found',
  409: 'busy',
};

/**
 * Posts a user message and returns the Server-Sent Events body of the answer. Throws a
 * SendMessageError when the API refuses the message, or the abort reason when `signal` fires.
 */
export async function openChatStream(
  conversationId: string,
  content: string,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
  let result;
  try {
    result = await api.POST('/api/conversations/{id}/messages', {
      params: { path: { id: conversationId } },
      body: { content },
      parseAs: 'stream',
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SendMessageError('unreachable', { cause: error });
  }

  const { data, response } = result;
  if (response.ok && data) return data;
  throw new SendMessageError(FAILURE_BY_STATUS[response.status] ?? 'server');
}
