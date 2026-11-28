import { useId } from 'react';

import { cn } from '@/lib/utils';

import type { UserStats } from './stats-api';
import { formatCount, formatPercent } from './usage-format';

type Outcome = keyof UserStats['outcomes'];

/**
 * How the requests ended. The colours also differ by lightness and by outline (the timeout
 * is a pale fill with an outline), and every figure is written in the list: the bar is only
 * a picture of it.
 */
const OUTCOMES: readonly { key: Outcome; label: string; swatch: string }[] = [
  { key: 'completed', label: 'Terminées', swatch: 'bg-ink' },
  { key: 'interrupted', label: 'Interrompues', swatch: 'bg-ink-3' },
  { key: 'error', label: 'Erreurs', swatch: 'bg-accent' },
  { key: 'timeout', label: 'Timeouts', swatch: 'border border-accent bg-accent-soft' },
];

/** Completed, interrupted, failed with an error, timed out: counts and shares. */
export function OutcomeBreakdown({ outcomes }: { outcomes: UserStats['outcomes'] }) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-[14px] border border-rule bg-raised p-4 md:p-5"
    >
      <h2 id={titleId} className="font-serif text-[17px] font-medium md:text-[19px]">
        Issue des requêtes
      </h2>

      <div aria-hidden="true" className="mt-4 flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]">
        {OUTCOMES.map(({ key, swatch }) =>
          outcomes[key].count > 0 ? (
            <div
              key={key}
              className={cn('box-border min-w-[3px]', swatch)}
              style={{ flex: `${outcomes[key].count} 1 0%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-3.5 grid gap-x-5 gap-y-2.5 text-sm md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        {OUTCOMES.map(({ key, label, swatch }) => (
          <li key={key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn('box-border size-3 shrink-0 rounded-[3px]', swatch)}
            />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-[13px] tabular-nums">
              {formatCount(outcomes[key].count)}
            </span>
            <span className="w-14 text-right font-mono text-[13px] text-ink-3 tabular-nums">
              {formatPercent(outcomes[key].rate)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
