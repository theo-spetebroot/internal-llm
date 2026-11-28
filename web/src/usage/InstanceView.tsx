import { useCurrentUser } from '@/auth/current-user';

import { ActivityCharts } from './ActivityCharts';
import { FigureCard, KeyFigures } from './KeyFigures';
import { OutcomeBreakdown } from './OutcomeBreakdown';
import type { AdminStats } from './stats-api';
import { formatCount } from './usage-format';
import { UserRanking } from './UserRanking';

/** The usage of the whole instance: the same figures as the user's own, then the ranking. */
export function InstanceView({ stats }: { stats: AdminStats }) {
  const user = useCurrentUser();

  return (
    <>
      <KeyFigures
        stats={stats}
        extra={
          <FigureCard
            label="Utilisateurs actifs"
            value={
              <>
                {formatCount(stats.activeUsers)}{' '}
                <span className="text-[20px] text-ink-3 md:text-[24px]">
                  sur {formatCount(stats.users.length)}
                </span>
              </>
            }
            detail="au moins une requête sur la période"
          />
        }
      />
      <ActivityCharts stats={stats} />
      <OutcomeBreakdown outcomes={stats.outcomes} />
      <UserRanking users={stats.users} currentEmail={user.email} />
    </>
  );
}
