import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useCurrentUser } from '@/auth/current-user';
import { useChatStore } from '@/chat/chat-context';
import { Composer } from '@/chat/Composer';
import { useCreateConversation } from '@/conversations/conversations-api';
import { PageHeader } from '@/layout/PageHeader';

/**
 * Landing screen and "new conversation": the conversation is only created when the first
 * message is sent, so that no empty conversation piles up in the sidebar.
 */
export function HomePage() {
  const user = useCurrentUser();
  const store = useChatStore();
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const [draft, setDraft] = useState('');
  const firstName = user.displayName.split(/\s+/)[0] ?? user.displayName;

  const send = (content: string) => {
    createConversation.mutate(undefined, {
      onSuccess: (conversation) => {
        // The answer keeps streaming in the store while the conversation page takes over.
        void store.send(conversation.id, content);
        void navigate(`/c/${conversation.id}`);
      },
    });
  };

  return (
    <>
      <title>internal-llm</title>
      <PageHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center gap-5 px-5 py-12 md:px-8 md:py-16">
          <div aria-hidden="true" className="h-0.5 w-10 bg-accent" />
          <h1 className="font-serif text-4xl leading-tight font-normal tracking-[-0.02em] italic md:text-5xl">
            Bonjour, {firstName}.
          </h1>
          <p className="max-w-md font-serif text-lg leading-relaxed text-ink-2">
            Que voulez-vous demander au modèle ?
          </p>
          <div className="mt-4">
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              busy={createConversation.isPending}
              placeholder="Démarrer une nouvelle conversation…"
              autoFocus
            />
          </div>
          {createConversation.isError && (
            <p
              role="alert"
              className="flex items-start gap-2.5 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm leading-snug text-danger-ink"
            >
              <CircleAlert
                className="mt-px size-[18px] shrink-0"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>La conversation n’a pas pu être créée. Réessayez dans un instant.</span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
