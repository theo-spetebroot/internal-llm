import { ArrowUp } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the trimmed message when the user sends it. */
  onSend: (content: string) => void;
  /** Sending is not possible (an answer is being written, a request is pending). */
  busy?: boolean;
  /** Replaces the send button (e.g. the stop button while an answer streams). */
  action?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_HEIGHT_PX = 240;

/** The message box: Enter sends, Shift+Enter goes to the next line, the box grows with text. */
export function Composer({
  value,
  onChange,
  onSend,
  busy = false,
  action,
  placeholder = 'Écrire un message…',
  autoFocus = false,
}: ComposerProps) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const content = value.trim();
  const canSend = content !== '' && !busy;

  // Grow with the content, up to a maximum height (then scroll).
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const send = () => {
    if (canSend) onSend(content);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter validates an IME composition (e.g. Japanese input), it does not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-2 rounded-2xl border border-rule bg-raised py-2.5 pr-2.5 pl-4 shadow-[0_1px_0_var(--rule),0_12px_32px_-20px_rgb(26_24_20/0.35)] focus-within:border-ink-3 md:pl-5"
    >
      <label htmlFor={id} className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          ref={textarea}
          id={id}
          rows={1}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-normal text-ink outline-none placeholder:text-ink-3"
        />
        {action ?? (
          <Button
            type="submit"
            size="icon"
            aria-label="Envoyer"
            title="Envoyer"
            disabled={!canSend}
            className="rounded-full"
          >
            <ArrowUp className="size-5" strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="hidden pb-0.5 text-xs text-ink-3 md:block">
        Entrée pour envoyer · Maj + Entrée pour aller à la ligne
      </p>
    </form>
  );
}
