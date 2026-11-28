import { useId } from 'react';

import { cn } from '@/lib/utils';
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/lib/use-media-query';

import type { RankingEntry } from './stats-api';
import { formatCount, formatPercent, formatTokens, NO_FIGURE } from './usage-format';

interface UserRankingProps {
  /** Every account, most requests first (as the API sends them). */
  users: readonly RankingEntry[];
  /** The signed-in user, whose row stands out. */
  currentEmail: string;
}

/** The share of failed requests; nothing to rate when the account made no request. */
function failure(user: RankingEntry): string {
  return user.requests === 0 ? NO_FIGURE : formatPercent(user.failureRate);
}

function YouBadge() {
  return (
    <span className="ml-2 inline-flex h-5 items-center rounded-full bg-ink px-2 align-middle text-[11px] font-medium text-paper">
      Vous
    </span>
  );
}

function Identity({ user, isCurrent }: { user: RankingEntry; isCurrent: boolean }) {
  return (
    <>
      <div className="font-medium">
        {user.displayName}
        {isCurrent && <YouBadge />}
      </div>
      <div className="text-[12.5px] break-all text-ink-3">{user.email}</div>
    </>
  );
}

/**
 * The accounts ranked by requests: a table from the `md` breakpoint, a list of cards below it.
 * The signed-in user's row is highlighted.
 */
export function UserRanking({ users, currentEmail }: UserRankingProps) {
  const titleId = useId();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const maxRequests = Math.max(1, ...users.map((user) => user.requests));

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-[14px] border border-rule bg-raised p-4 md:px-2 md:pt-5 md:pb-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 md:px-3">
        <h2 id={titleId} className="font-serif text-[17px] font-medium md:text-[19px]">
          Par utilisateur
        </h2>
        <p className="text-[13px] text-ink-3">Tous les comptes, du plus actif au moins actif</p>
      </div>

      {isDesktop ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Classement des utilisateurs</caption>
            <thead>
              <tr className="text-xs tracking-[0.04em] text-ink-3 uppercase">
                <th scope="col" className="border-b border-rule px-3 py-2.5 font-medium">
                  Utilisateur
                </th>
                <th scope="col" className="border-b border-rule px-3 py-2.5 text-right font-medium">
                  Requêtes
                </th>
                <th scope="col" className="border-b border-rule px-3 py-2.5 text-right font-medium">
                  Tokens prompt
                </th>
                <th scope="col" className="border-b border-rule px-3 py-2.5 text-right font-medium">
                  Tokens réponse
                </th>
                <th scope="col" className="border-b border-rule px-3 py-2.5 text-right font-medium">
                  Échecs
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isCurrent = user.email === currentEmail;
                return (
                  <tr
                    key={user.email}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cn(
                      'border-b border-rule last:border-b-0',
                      isCurrent && 'bg-accent-soft',
                    )}
                  >
                    <td className="px-3 py-3">
                      <Identity user={user} isCurrent={isCurrent} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-[90px] overflow-hidden rounded-[3px] bg-active"
                        >
                          <span
                            className="block h-full bg-ink"
                            style={{ width: `${(user.requests / maxRequests) * 100}%` }}
                          />
                        </span>
                        <span className="min-w-11 text-right font-mono text-[13px] tabular-nums">
                          {formatCount(user.requests)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">
                      {formatTokens(user.promptTokens)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">
                      {formatTokens(user.completionTokens)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">
                      {failure(user)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {users.map((user) => {
            const isCurrent = user.email === currentEmail;
            return (
              <li
                key={user.email}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border border-rule p-3.5',
                  isCurrent && 'bg-accent-soft',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Identity user={user} isCurrent={isCurrent} />
                  </div>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums">
                    {formatCount(user.requests)} req.
                  </span>
                </div>
                <div className="flex justify-between gap-3 font-mono text-[12.5px] text-ink-2 tabular-nums">
                  <span>
                    {formatTokens(user.promptTokens)} prompt · {formatTokens(user.completionTokens)}{' '}
                    réponse
                  </span>
                  <span>échecs {failure(user)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-ink-3 md:px-3 md:pb-3">
        Échecs : erreurs et timeouts, en part des requêtes de l’utilisateur.
      </p>
    </section>
  );
}
