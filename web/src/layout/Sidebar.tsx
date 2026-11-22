import { LogOut, PanelLeftClose, Plus, X } from 'lucide-react';
import { Link } from 'react-router';

import { useCurrentUser } from '@/auth/current-user';
import { useLogout } from '@/auth/session';
import { Brand } from '@/components/Brand';
import { ConversationList } from '@/conversations/ConversationList';
import { Button } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';

interface SidebarProps {
  /** Docked (desktop) or inside the mobile drawer. */
  variant: 'docked' | 'drawer';
  /** Docked only: hides the sidebar. */
  onCollapse?: () => void;
  /** Called when a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
}

export function Sidebar({ variant, onCollapse, onNavigate }: SidebarProps) {
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

      <div className="px-4 pb-4">
        <Button asChild variant="outline" className="w-full justify-start gap-2.5 px-3.5">
          <Link to="/" onClick={onNavigate}>
            <Plus className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            Nouvelle conversation
          </Link>
        </Button>
      </div>

      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ConversationList onNavigate={onNavigate} />
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
