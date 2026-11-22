import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-[10px] border border-rule bg-raised px-3.5 text-base text-ink transition-[border-color,outline-color] placeholder:text-ink-3',
        'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger-ink',
        className,
      )}
      {...props}
    />
  );
}
