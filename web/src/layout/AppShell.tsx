import { Menu, PanelLeftOpen, SquarePen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router';

import { ChatStoreContext } from '@/chat/chat-context';
import { ChatStore } from '@/chat/chat-store';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { readStorage, writeStorage } from '@/lib/storage';
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/lib/use-media-query';

import { SIDEBAR_COLLAPSED_STORAGE_KEY } from './layout.constants';
import {
  NEW_CONVERSATION_ARIA_SHORTCUTS,
  newConversationShortcutLabel,
  useNewConversationShortcut,
} from './new-conversation-shortcut';
import { ShellContext, type ShellContextValue } from './shell-context';
import { Sidebar } from './Sidebar';

/**
 * Authenticated layout. From the `md` breakpoint the sidebar is docked and can be
 * collapsed (remembered per browser); below it, it opens as a drawer over the page.
 * Pages render their own header (PageHeader), which gets the navigation buttons from here.
 */
export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [collapsed, setCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true',
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryClient = useQueryClient();
  const [chatStore] = useState(() => new ChatStore(queryClient));

  // Leaving the authenticated area (logout, expired session) stops the answers in progress.
  useEffect(
    () => () => {
      chatStore.abortAll();
    },
    [chatStore],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  useNewConversationShortcut(closeDrawer);

  const showDocked = isDesktop && !collapsed;

  const shell = useMemo<ShellContextValue>(() => {
    if (showDocked) return { leading: null, trailing: null };

    const setCollapsedAndRemember = (value: boolean) => {
      writeStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
      setCollapsed(value);
    };

    const leading = isDesktop ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Déplier la barre latérale"
        title="Déplier la barre latérale"
        onClick={() => {
          setCollapsedAndRemember(false);
        }}
      >
        <PanelLeftOpen className="size-5" strokeWidth={1.6} aria-hidden="true" />
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ouvrir la navigation"
        aria-expanded={drawerOpen}
        onClick={() => {
          setDrawerOpen(true);
        }}
      >
        <Menu className="size-[22px]" strokeWidth={1.7} aria-hidden="true" />
      </Button>
    );

    const trailing = (
      <Button asChild variant="ghost" size="icon">
        <Link
          to="/"
          aria-label="Nouvelle conversation"
          aria-keyshortcuts={NEW_CONVERSATION_ARIA_SHORTCUTS}
          title={`Nouvelle conversation (${newConversationShortcutLabel()})`}
        >
          <SquarePen className="size-5" strokeWidth={1.7} aria-hidden="true" />
        </Link>
      </Button>
    );

    return { leading, trailing };
  }, [showDocked, isDesktop, drawerOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {showDocked && (
        <aside className="w-72 shrink-0 border-r border-rule bg-sidebar">
          <Sidebar
            variant="docked"
            onCollapse={() => {
              writeStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true');
              setCollapsed(true);
            }}
          />
        </aside>
      )}

      {!isDesktop && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Conversations, thème et compte</SheetDescription>
            <Sidebar variant="drawer" onNavigate={closeDrawer} />
          </SheetContent>
        </Sheet>
      )}

      <ChatStoreContext value={chatStore}>
        <ShellContext value={shell}>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </ShellContext>
      </ChatStoreContext>
    </div>
  );
}
