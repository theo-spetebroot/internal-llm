import { CircleAlert, Square } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';

import { useChatStore, useExchange } from '@/chat/chat-context';
import { Composer } from '@/chat/Composer';
import { useStickToBottom } from '@/chat/use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/layout/PageHeader';
import { NotFoundContent } from '@/pages/NotFoundPage';

import { DeleteConversationButton, RenameButton, TitleEditor } from './ConversationActions';
import {
  useConversation,
  useRenameConversation,
  type ConversationDetail,
} from './conversations-api';
import { AssistantMessage, MessageThread, UserMessage } from './MessageThread';

export function ConversationPage() {
  const { conversationId = '' } = useParams();
  // One view per conversation: the draft and the scroll position never leak to another one.
  return <ConversationLoader key={conversationId} conversationId={conversationId} />;
}

function ConversationLoader({ conversationId }: { conversationId: string }) {
  const conversation = useConversation(conversationId);

  if (conversation.isPending) {
    return (
      <>
        <PageHeader title="" />
        <p role="status" className="sr-only">
          Chargement de la conversation…
        </p>
      </>
    );
  }

  if (conversation.isError) {
    return (
      <>
        <PageHeader />
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <p className="font-serif text-xl">Impossible de charger cette conversation.</p>
          <Button
            variant="outline"
            disabled={conversation.isFetching}
            onClick={() => {
              void conversation.refetch();
            }}
          >
            Réessayer
          </Button>
        </div>
      </>
    );
  }

  if (!conversation.data) {
    return (
      <>
        <PageHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NotFoundContent />
        </div>
      </>
    );
  }

  return <ConversationView conversation={conversation.data} />;
}

function ConversationView({ conversation }: { conversation: ConversationDetail }) {
  const store = useChatStore();
  const exchange = useExchange(conversation.id);
  const [draft, setDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const rename = useRenameConversation(conversation.id);
  // Optimistic: the new title shows while it is being saved.
  const title = rename.isPending ? rename.variables : conversation.title;
  const {
    ref: scroller,
    onScroll,
    pin,
  } = useStickToBottom<HTMLDivElement>(
    `${conversation.messages.length}:${exchange?.status ?? ''}:${exchange?.answer.length ?? 0}`,
  );

  const inProgress = exchange?.status === 'sending' || exchange?.status === 'streaming';
  const isEmpty = conversation.messages.length === 0 && !inProgress;

  const send = (content: string) => {
    setDraft('');
    pin();
    void store.send(conversation.id, content).then((outcome) => {
      // Not saved: give the text back, unless the user already typed something else.
      if (outcome === 'not-saved') setDraft((current) => current || content);
    });
  };

  return (
    <>
      <title>{`${title} · internal-llm`}</title>
      <PageHeader
        title={title}
        heading={
          editingTitle ? (
            <TitleEditor
              title={title}
              onSave={(next) => {
                rename.mutate(next);
              }}
              onClose={() => {
                setEditingTitle(false);
              }}
            />
          ) : undefined
        }
        actions={
          <>
            <RenameButton
              onClick={() => {
                rename.reset();
                setEditingTitle(true);
              }}
            />
            <DeleteConversationButton conversation={{ ...conversation, title }} />
          </>
        }
      />
      {rename.isError && (
        <p
          role="alert"
          className="border-b border-rule bg-danger-bg px-5 py-2.5 text-sm text-danger-ink md:px-8"
        >
          Le renommage a échoué. Réessayez dans un instant.
        </p>
      )}

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-6 md:px-8 md:py-9">
          {isEmpty && (
            <p className="py-16 text-center font-serif text-lg text-ink-3 italic">
              Aucun message pour l’instant.
            </p>
          )}
          <MessageThread messages={conversation.messages} />

          {inProgress && (
            <>
              <UserMessage content={exchange.userMessage?.content ?? exchange.userContent} />
              <AssistantMessage content={exchange.answer} streaming />
            </>
          )}

          {exchange?.status === 'failed' && exchange.error && (
            <p
              role="alert"
              className="flex items-start gap-2.5 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm leading-snug text-danger-ink"
            >
              <CircleAlert
                className="mt-px size-[18px] shrink-0"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>{exchange.error}</span>
            </p>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        {inProgress ? 'Le modèle répond…' : ''}
      </p>

      <div className="shrink-0 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        <div className="mx-auto w-full max-w-[720px]">
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            busy={inProgress}
            autoFocus
            action={
              inProgress ? (
                <Button
                  variant="outline"
                  aria-label="Arrêter la réponse"
                  title="Arrêter la réponse"
                  onClick={() => {
                    store.stop(conversation.id);
                  }}
                  className="rounded-full border-accent bg-transparent px-4 text-accent hover:bg-accent-soft"
                >
                  <Square className="size-3.5 fill-current" strokeWidth={0} aria-hidden="true" />
                  <span className="hidden sm:inline">Arrêter</span>
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    </>
  );
}
