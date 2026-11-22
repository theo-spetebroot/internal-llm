import type { ReactNode } from 'react';

import { Brand } from '@/components/Brand';
import { cn } from '@/lib/utils';

import { useShell } from './shell-context';

interface PageHeaderProps {
  /** Page title; the wordmark is shown instead when there is none. */
  title?: ReactNode;
  /** Page actions (rename, delete…), on the right. */
  actions?: ReactNode;
}

/**
 * Top bar of a page, holding the shell's navigation buttons when the sidebar is not docked.
 * Renders nothing when it would be empty (docked sidebar, no title, no actions).
 */
export function PageHeader({ title, actions }: PageHeaderProps) {
  const { leading, trailing } = useShell();
  if (!leading && title === undefined && !actions) return null;

  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-1 border-b border-rule pt-[max(0.5rem,env(safe-area-inset-top))] pb-2',
        leading ? 'px-1.5' : 'pr-3 pl-8',
      )}
    >
      {leading}
      <div className={cn('min-w-0 flex-1', leading && 'px-1')}>
        {title === undefined ? (
          <Brand className="text-xl" />
        ) : (
          <h1 className="truncate font-serif text-lg font-medium tracking-[-0.01em] md:text-[22px]">
            {title}
          </h1>
        )}
      </div>
      {actions}
      {trailing}
    </header>
  );
}
