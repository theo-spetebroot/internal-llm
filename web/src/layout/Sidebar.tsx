import { LogOut, PanelLeftClose, X } from 'lucide-react';

import { useCurrentUser } from '@/auth/current-user';
import { useLogout } from '@/auth/session';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';

interface SidebarProps {
  /** Docked (desktop) or inside the mobile drawer. */
  variant: 'docked' | 'drawer';
  /** Docked only: hides the sidebar. */
  onCollapse?: () => void;
}

export function Sidebar({ variant, onCollapse }: SidebarProps) {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between py-3 pr-2 pl-6">
        <Brand />
        {variant === 'docked' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Replier la barre latérale"
            title="Replier la barre latérale"
            onClick={onCollapse}
          >
            <PanelLeftClose className="size-5" strokeWidth={1.6} aria-hidden="true" />
          </Button>
        ) : (
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Fermer la navigation">
              <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </Button>
          </SheetClose>
        )}
      </div>

      <nav aria-label="Conversations" className="flex-1 overflow-y-auto px-2 py-1">
        {/* The conversation list lands with the chat (next step). */}
      </nav>

      <div className="flex flex-col gap-3 border-t border-rule p-4">
        <ThemeSwitcher />
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-[17px] font-medium text-accent italic"
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.displayName}</div>
            <div className="truncate text-xs text-ink-3">{user.email}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate();
            }}
          >
            <LogOut className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
