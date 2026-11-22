import { NavLink } from 'react-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useConversations } from './conversations-api';
import { groupByDate } from './group-by-date';

/** The sidebar's conversations, grouped by last activity; the open one is highlighted. */
export function ConversationList({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const conversations = useConversations();

  if (conversations.isPending) {
    return (
      <div className="flex flex-col gap-2 px-4 pt-8">
        <span role="status" className="sr-only">
          Chargement des conversations…
        </span>
        {[72, 88, 64].map((width) => (
          <div
            key={width}
            aria-hidden="true"
            className="h-4 animate-pulse rounded bg-active"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    );
  }

  if (conversations.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 px-4 pt-6 text-sm text-ink-2">
        <p>Impossible de charger les conversations.</p>
        <Button
          variant="outline"
          disabled={conversations.isFetching}
          onClick={() => {
            void conversations.refetch();
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  }

  if (conversations.data.length === 0) {
    return <p className="px-4 pt-6 text-sm text-ink-3">Aucune conversation pour l’instant.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groupByDate(conversations.data).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="px-4 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            {group.label}
          </h2>
          <ul className="flex flex-col">
            {group.conversations.map((conversation) => (
              <li key={conversation.id}>
                <NavLink
                  to={`/c/${conversation.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-2.5 rounded-lg px-4 text-[15px] text-ink-2 transition-colors hover:bg-active hover:text-ink md:min-h-9 md:text-sm',
                      isActive && 'bg-active font-medium text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn('size-1.5 shrink-0 rounded-full', isActive && 'bg-accent')}
                      />
                      <span className="truncate">{conversation.title}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
