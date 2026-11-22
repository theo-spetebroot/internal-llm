import type { ChatEvent } from '../../src/chat/chat.schemas.js';

/**
 * Parses a complete `text/event-stream` body into its JSON events. Comment lines
 * (heartbeats) are ignored; the `event:` name must match the payload's `type`.
 * Note: dates are ISO strings on the wire, although `ChatEvent` types them as `Date`.
 */
export function parseSse(body: string): ChatEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim() !== '' && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split('\n');
      const name = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
      if (data === undefined) throw new Error(`SSE block without data: ${block}`);
      const event = JSON.parse(data) as ChatEvent;
      if (name !== event.type) throw new Error(`Event name ${String(name)} != ${event.type}`);
      return event;
    });
}

/** Narrows a list of events to those of one type. */
export function eventsOfType<T extends ChatEvent['type']>(
  events: ChatEvent[],
  type: T,
): Extract<ChatEvent, { type: T }>[] {
  return events.filter((event): event is Extract<ChatEvent, { type: T }> => event.type === type);
}
