import { BarChart, type ChartSeries } from './BarChart';
import type { UserStats } from './stats-api';

const REQUESTS: ChartSeries[] = [
  { id: 'requests', label: 'Requêtes', className: 'bg-ink', value: (day) => day.requests },
];

const TOKENS: ChartSeries[] = [
  { id: 'prompt', label: 'Prompt', className: 'bg-ink-3', value: (day) => day.promptTokens },
  {
    id: 'completion',
    label: 'Réponse',
    className: 'bg-accent',
    value: (day) => day.completionTokens,
  },
];

/** The requests and the tokens of each day of the period. */
export function ActivityCharts({ stats }: { stats: UserStats }) {
  return (
    <section aria-label="Activité par jour" className="grid gap-3.5 md:grid-cols-2">
      <BarChart
        title="Requêtes par jour"
        days={stats.daily}
        series={REQUESTS}
        unitOf={(count) => (count <= 1 ? 'requête' : 'requêtes')}
      />
      <BarChart
        title="Tokens par jour"
        days={stats.daily}
        series={TOKENS}
        unitOf={(count) => (count <= 1 ? 'token' : 'tokens')}
      />
    </section>
  );
}
