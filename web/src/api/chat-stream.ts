import { chatEventSchema, type ChatEvent } from './chat-events';
import { readServerSentEvents } from './sse';

/** The stream sent something that is not a valid chat event: the contract is broken. */
export class ChatStreamError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChatStreamError';
  }
}

/** Reads the SSE body of a send-message request, validating every event against the contract. */
export async function* readChatEvents(
  body: ReadableStream<BufferSource>,
): AsyncGenerator<ChatEvent, void, undefined> {
  for await (const { data } of readServerSentEvents(body)) {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch (error) {
      throw new ChatStreamError('A chat event is not valid JSON', { cause: error });
    }
    const parsed = chatEventSchema.safeParse(json);
    if (!parsed.success) {
      throw new ChatStreamError('A chat event does not match the contract', {
        cause: parsed.error,
      });
    }
    yield parsed.data;
  }
}
