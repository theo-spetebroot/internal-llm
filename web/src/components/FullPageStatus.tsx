import type { ReactNode } from 'react';

import { Brand } from './Brand';

/** Centered message over the whole page (session loading, server unreachable…). */
export function FullPageStatus({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <Brand className="text-3xl" />
      {children}
    </div>
  );
}
