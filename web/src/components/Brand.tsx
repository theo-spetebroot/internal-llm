import { cn } from '@/lib/utils';

/** The "internal-llm" wordmark. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('font-serif text-2xl font-medium tracking-[-0.01em]', className)}>
      internal<span className="text-accent italic">-</span>llm
    </span>
  );
}
