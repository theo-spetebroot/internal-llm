import { Menu, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { readStorage, writeStorage } from '@/lib/storage';
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/lib/use-media-query';

import { SIDEBAR_COLLAPSED_STORAGE_KEY } from './layout.constants';
import { Sidebar } from './Sidebar';

/**
 * Authenticated layout. From the `md` breakpoint the sidebar is docked and can be
 * collapsed (remembered per browser); below it, it opens as a drawer over the page.
 */
export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [collapsed, setCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true',
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setCollapsedAndRemember = (value: boolean) => {
    writeStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
    setCollapsed(value);
  };

  const showDocked = isDesktop && !collapsed;

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {showDocked && (
        <aside className="w-72 shrink-0 border-r border-rule bg-sidebar">
          <Sidebar
            variant="docked"
            onCollapse={() => {
              setCollapsedAndRemember(true);
            }}
          />
        </aside>
      )}

      {!isDesktop && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Conversations, thème et compte</SheetDescription>
            <Sidebar variant="drawer" />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!showDocked && (
          <header className="flex shrink-0 items-center gap-1 border-b border-rule px-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            {isDesktop ? (
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
            )}
            <Brand className="text-xl" />
          </header>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
