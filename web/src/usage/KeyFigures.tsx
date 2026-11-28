import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { UserStats } from './stats-api';
import { formatCount, formatDuration, formatPerDay, formatTokens } from './usage-format';

export function FigureCard({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-rule bg-raised p-4 md:p-5">
      <dt className="text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">{label}</dt>
      <dd className="mt-2 font-serif text-[32px] leading-none font-normal tracking-[-0.02em] tabular-nums md:mt-2.5 md:text-[40px]">
        {value}
      </dd>
      <dd className="mt-1.5 text-[13px] leading-snug text-ink-2">{detail}</dd>
      {badge && <dd className="mt-2">{badge}</dd>}
    </div>
  );
}

/** Tells whether the token counts come from the model server or from a heuristic. */
function EstimatedBadge({ tokens }: { tokens: UserStats['tokens'] }) {
  const estimated = tokens.prompt.estimated + tokens.completion.estimated;
  if (estimated === 0) return null;
  const reported = tokens.prompt.reported + tokens.completion.reported;
  return (
    <span
      title="Le serveur du modèle ne fournit pas (encore) ses propres chiffres : environ 4 caractères par token."
      className="inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 text-xs font-medium text-ink"
    >
      {reported === 0 ? 'estimés' : 'en partie estimés'}
    </span>
  );
}

/** The headline figures of a period: requests, tokens and the two average durations. */
export function KeyFigures({ stats, extra }: { stats: UserStats; extra?: ReactNode }) {
  const { requests, tokens, averages, period } = stats;
  const totalTokens = tokens.prompt.total + tokens.completion.total;

  return (
    <dl
      aria-label="Chiffres clés"
      className={cn(
        'grid grid-cols-2 gap-2.5 md:gap-3.5',
        // A fifth card (the instance's active users) needs narrower columns to stay on the row.
        extra
          ? 'md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]'
          : 'md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]',
      )}
    >
      <FigureCard
        label="Requêtes"
        value={formatCount(requests)}
        detail={formatPerDay(requests, period.days)}
      />
      <FigureCard
        label="Tokens"
        value={formatTokens(totalTokens)}
        detail={`${formatTokens(tokens.prompt.total)} prompt · ${formatTokens(tokens.completion.total)} réponse`}
        badge={<EstimatedBadge tokens={tokens} />}
      />
      <FigureCard
        label="Durée moyenne"
        value={formatDuration(averages.durationMs)}
        detail="par requête, de l’envoi à la fin"
      />
      <FigureCard
        label="Premier token"
        value={formatDuration(averages.timeToFirstTokenMs)}
        detail="délai moyen avant le début de la réponse"
      />
      {extra}
    </dl>
  );
}
