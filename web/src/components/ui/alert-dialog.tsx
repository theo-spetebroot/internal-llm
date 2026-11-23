import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

import { buttonVariants } from './button';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

/** A modal confirmation: focus is trapped, Escape and "Annuler" close it, the scrim does not. */
export function AlertDialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-rule bg-raised p-6 shadow-[0_24px_64px_-24px_rgb(26_24_20/0.5)]',
          'data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('font-serif text-2xl font-medium tracking-[-0.01em]', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-[15px] leading-relaxed text-ink-2', className)}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: 'outline' }), className)}
      {...props}
    />
  );
}
