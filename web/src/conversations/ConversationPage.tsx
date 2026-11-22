import { useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/layout/PageHeader';
import { NotFoundContent } from '@/pages/NotFoundPage';

import { useConversation } from './conversations-api';
import { MessageThread } from './MessageThread';

export function ConversationPage() {
  const { conversationId = '' } = useParams();
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

  const { title, messages } = conversation.data;

  return (
    <>
      <title>{`${title} · internal-llm`}</title>
      <PageHeader title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 py-6 md:px-8 md:py-9">
          <MessageThread messages={messages} />
        </div>
      </div>
    </>
  );
}
