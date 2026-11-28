import { CircleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { Button, buttonVariants } from '@/components/ui/button';

import type { UsagePeriod } from './usage-period';

/** Placeholder blocks while the figures load. */
export function UsageSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3.5">
      <p role="status" className="sr-only">
        Chargement des chiffres…
      </p>
      <div aria-hidden="true" className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3.5">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-[108px] animate-pulse rounded-[14px] border border-rule bg-raised md:h-[124px]"
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="h-56 animate-pulse rounded-[14px] border border-rule bg-raised"
      />
    </div>
  );
}

interface UsageEmptyProps {
  period: UsagePeriod;
  /** Offered when a longer period could hold some activity. */
  onShowLongerPeriod: (days: UsagePeriod) => void;
}

/** No LLM call over the period. */
export function UsageEmpty({ period, onShowLongerPeriod }: UsageEmptyProps) {
  return (
    <section
      aria-label="Aucune donnée"
      className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised px-5 py-10 md:px-10 md:py-14"
    >
      <div aria-hidden="true" className="h-0.5 w-10 bg-accent" />
      <h2 className="font-serif text-3xl leading-tight font-normal tracking-[-0.02em] italic">
        Rien à compter pour l’instant.
      </h2>
      <p className="max-w-md font-serif text-[17px] leading-relaxed text-ink-2">
        Aucune requête sur les {period} derniers jours. Les chiffres apparaîtront ici dès la
        première conversation.
      </p>
      <div className="mt-1 flex flex-wrap gap-2.5">
        <Link to="/" className={buttonVariants({ variant: 'primary' })}>
          Démarrer une conversation
        </Link>
        {period < 90 && (
          <Button
            variant="outline"
            onClick={() => {
              onShowLongerPeriod(90);
            }}
          >
            Voir 90 jours
          </Button>
        )}
      </div>
    </section>
  );
}

interface UsageErrorProps {
  message: string;
  /** Left out when retrying would answer the same (an access refused). */
  onRetry?: (() => void) | undefined;
  retrying?: boolean;
}

/** The figures could not be loaded. */
export function UsageError({ message, onRetry, retrying = false }: UsageErrorProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p
        role="alert"
        className="flex items-start gap-2.5 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm leading-snug text-danger-ink"
      >
        <CircleAlert className="mt-px size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button variant="outline" disabled={retrying} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
