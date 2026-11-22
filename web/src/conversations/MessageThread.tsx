import { Square } from 'lucide-react';

import { LazyMarkdown } from '@/markdown/LazyMarkdown';

import type { Message } from './conversations-api';
import { formatMessageTime } from './format-time';

/** A user message: a "slip" of raised paper, on the right. */
function UserMessage({ message }: { message: Message }) {
  return (
    <article aria-label="Votre message" className="flex justify-end">
      <div className="max-w-[85%] rounded-[14px_14px_4px_14px] border border-rule bg-raised px-4 py-3 leading-normal whitespace-pre-wrap md:max-w-[78%] md:px-[18px] md:py-3.5">
        {message.content}
      </div>
    </article>
  );
}

/** An answer of the model: unboxed prose under a small "Réponse · time" line. */
function AssistantMessage({ message }: { message: Message }) {
  return (
    <article aria-label="Réponse du modèle">
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
        <span aria-hidden="true" className="h-px w-3.5 bg-accent" />
        Réponse · <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </p>
      <div className="font-serif text-[17.5px] leading-relaxed md:text-[19px]">
        <LazyMarkdown>{message.content}</LazyMarkdown>
      </div>
      {message.interrupted && <InterruptedMarker />}
    </article>
  );
}

export function InterruptedMarker() {
  return (
    <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-rule px-2.5 py-1.5 text-[13px] text-ink-2">
      <Square className="size-3.5 fill-current" strokeWidth={0} aria-hidden="true" />
      Réponse interrompue
    </p>
  );
}

/** The messages of a conversation, oldest first. System messages are not shown. */
export function MessageThread({ messages }: { messages: Message[] }) {
  const visible = messages.filter((message) => message.role !== 'system');

  if (visible.length === 0) {
    return (
      <p className="py-16 text-center font-serif text-lg text-ink-3 italic">
        Aucun message pour l’instant.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {visible.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage key={message.id} message={message} />
        ),
      )}
    </div>
  );
}
