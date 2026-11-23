import { Square } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { LazyMarkdown } from '@/markdown/LazyMarkdown';

import type { Message } from './conversations-api';
import { formatMessageTime } from './format-time';

/** A user message: a "slip" of raised paper, on the right. */
export function UserMessage({ content }: { content: string }) {
  return (
    <article aria-label="Votre message" className="flex justify-end">
      <div className="max-w-[85%] rounded-[14px_14px_4px_14px] border border-rule bg-raised px-4 py-3 leading-normal whitespace-pre-wrap md:max-w-[78%] md:px-[18px] md:py-3.5">
        {content}
      </div>
    </article>
  );
}

interface AssistantMessageProps {
  content: string;
  /** Saved answers show their time; one being written shows "En train d'écrire…". */
  createdAt?: string;
  streaming?: boolean;
  interrupted?: boolean;
  /** Shown under the answer (e.g. the stop button while streaming). */
  footer?: ReactNode;
}

/** An answer of the model: unboxed prose under a small "Réponse · time" line. */
export function AssistantMessage({
  content,
  createdAt,
  streaming = false,
  interrupted = false,
  footer,
}: AssistantMessageProps) {
  return (
    <article aria-label="Réponse du modèle" aria-busy={streaming || undefined}>
      <p
        className={cn(
          'mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] uppercase',
          streaming ? 'text-accent' : 'text-ink-3',
        )}
      >
        <span aria-hidden="true" className="h-px w-3.5 bg-accent" />
        {streaming || !createdAt ? (
          'En train d’écrire…'
        ) : (
          <>
            Réponse · <time dateTime={createdAt}>{formatMessageTime(createdAt)}</time>
          </>
        )}
      </p>
      <div
        className={cn(
          'font-serif text-[17.5px] leading-relaxed md:text-[19px]',
          streaming && 'is-streaming',
        )}
      >
        {content === '' && streaming ? (
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <LazyMarkdown>{content}</LazyMarkdown>
        )}
      </div>
      {interrupted && <InterruptedMarker />}
      {footer}
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

/** The saved messages of a conversation, oldest first. System messages are not shown. */
export function MessageThread({ messages }: { messages: Message[] }) {
  const visible = messages.filter((message) => message.role !== 'system');

  return (
    <>
      {visible.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} content={message.content} />
        ) : (
          <AssistantMessage
            key={message.id}
            content={message.content}
            createdAt={message.createdAt}
            interrupted={message.interrupted}
          />
        ),
      )}
    </>
  );
}
