import { ChevronDown } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { barHeights } from './chart-scale';
import type { DailyPoint } from './stats-api';
import { formatCount, formatDay, formatLongDay } from './usage-format';

/** One stacked part of a bar (the first series is at the bottom). */
export interface ChartSeries {
  id: string;
  label: string;
  /** Background class of its bars and of its swatch: a colour token, so that themes follow. */
  className: string;
  value: (point: DailyPoint) => number;
}

interface BarChartProps {
  title: string;
  days: readonly DailyPoint[];
  series: readonly ChartSeries[];
  /** The unit after a count, agreed with it: "requête" / "requêtes". */
  unitOf: (count: number) => string;
}

type TooltipShift = -12 | -50 | -88;

/** Keeps the tooltip inside the chart: anchored by its start, centre or end near the edges. */
function tooltipShift(fraction: number): TooltipShift {
  if (fraction < 0.25) return -12;
  if (fraction > 0.75) return -88;
  return -50;
}

/**
 * Daily bars drawn by hand (no charting library). One tab stop for the whole chart: the arrow
 * keys, Home and End move between the days, and each day is announced with its date and exact
 * values. Hover and focus show a tooltip with the same text (Escape dismisses it). The same
 * figures are available as a table.
 */
export function BarChart({ title, days, series, unitOf }: BarChartProps) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(days.length - 1);
  const [dismissed, setDismissed] = useState(false);

  const stacked = series.length > 1;
  const valuesOf = (day: DailyPoint) => series.map((part) => part.value(day));
  const totalOf = (day: DailyPoint) => valuesOf(day).reduce((sum, value) => sum + value, 0);

  const totals = days.map(totalOf);
  const heights = barHeights(totals);
  const max = Math.max(0, ...totals);
  const grandTotal = totals.reduce((sum, total) => sum + total, 0);
  const maxDay = days[totals.indexOf(max)];
  const first = days[0];
  const last = days.at(-1);
  const middle = days[Math.floor((days.length - 1) / 2)];

  const describe = (day: DailyPoint): string => {
    const total = totalOf(day);
    if (!stacked) return `${formatCount(total)} ${unitOf(total)}`;
    const parts = series.map((part) => `${part.label} ${formatCount(part.value(day))}`);
    return `${parts.join(', ')}, total ${formatCount(total)}`;
  };

  const summary =
    first && last && maxDay
      ? `${title}, du ${formatDay(first.date)} au ${formatDay(last.date)} : ${formatCount(grandTotal)} au total, maximum ${formatCount(max)} le ${formatDay(maxDay.date)}`
      : title;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === 'Escape') {
      setDismissed(true);
      return;
    }
    const lastIndex = days.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = Math.min(index + 1, lastIndex);
    else if (event.key === 'ArrowLeft') next = Math.max(index - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lastIndex;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };

  const activeIndex = dismissed ? null : (hovered ?? focused);
  const activeDay = activeIndex === null ? undefined : days[activeIndex];

  return (
    <figure className="min-w-0 rounded-[14px] border border-rule bg-raised p-4 md:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-serif text-[17px] font-medium md:text-[19px]">{title}</h2>
        {stacked ? (
          <ul className="flex gap-3.5">
            {series.map((part) => (
              <li
                key={part.id}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2"
              >
                <span aria-hidden="true" className={cn('size-2.5 rounded-[2px]', part.className)} />
                {part.label}
              </li>
            ))}
          </ul>
        ) : (
          <span className="font-mono text-xs text-ink-3">max {formatCount(max)}</span>
        )}
      </figcaption>

      <div role="group" aria-label={summary} className="relative mt-4 md:mt-[18px]">
        {activeIndex !== null && activeDay && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 z-10 w-max max-w-[230px] rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-paper shadow-md"
            style={{
              left: `${((activeIndex + 0.5) / days.length) * 100}%`,
              transform: `translate(${tooltipShift((activeIndex + 0.5) / days.length)}%, -100%)`,
            }}
          >
            <div className="font-medium">{formatLongDay(activeDay.date)}</div>
            {stacked ? (
              <>
                {series.map((part) => (
                  <div key={part.id} className="flex items-center gap-1.5 tabular-nums">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 rounded-[2px]', part.className)}
                    />
                    {part.label} : {formatCount(part.value(activeDay))}
                  </div>
                ))}
                <div className="tabular-nums">Total : {formatCount(totalOf(activeDay))}</div>
              </>
            ) : (
              <div className="tabular-nums">{describe(activeDay)}</div>
            )}
          </div>
        )}

        <div className="flex h-[120px] items-end gap-0.5 border-b border-rule bg-[linear-gradient(var(--rule)_1px,transparent_1px)] bg-[length:100%_33.3333%] md:h-[168px] md:gap-[3px]">
          {days.map((day, index) => (
            <div
              key={day.date}
              ref={(element) => {
                refs.current[index] = element;
              }}
              role="img"
              aria-label={`${formatDay(day.date)} : ${describe(day)}`}
              tabIndex={index === Math.min(tabStop, days.length - 1) ? 0 : -1}
              onMouseEnter={() => {
                setDismissed(false);
                setHovered(index);
              }}
              onMouseLeave={() => {
                setHovered(null);
              }}
              onFocus={() => {
                setDismissed(false);
                setFocused(index);
                setTabStop(index);
              }}
              onBlur={() => {
                setFocused(null);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
              className={cn(
                'flex h-full min-w-0 flex-1 items-end rounded-[3px]',
                activeIndex === index && 'bg-active',
              )}
            >
              {totals[index] === 0 ? (
                <div aria-hidden="true" className="h-0.5 w-full bg-rule" />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex min-h-0.5 w-full flex-col-reverse overflow-hidden rounded-t-[3px]"
                  style={{ height: `${heights[index] ?? 0}%` }}
                >
                  {series.map((part, partIndex) => (
                    <div
                      key={part.id}
                      // A thin paper line between the parts: they differ by position, not by
                      // colour alone.
                      className={cn(part.className, partIndex > 0 && 'border-t border-raised')}
                      style={{ flex: `${valuesOf(day)[partIndex] ?? 0} 1 0%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {first && middle && last && (
        <div
          aria-hidden="true"
          className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-3 md:text-[11px]"
        >
          <span>{formatDay(first.date)}</span>
          <span>{formatDay(middle.date)}</span>
          <span>{formatDay(last.date)}</span>
        </div>
      )}

      <details className="group mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
          Voir les données en tableau
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </summary>
        <div className="mt-1 max-h-64 overflow-auto rounded-lg border border-rule">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-sidebar">
              <tr>
                <th scope="col" className="px-3 py-2 text-xs font-semibold text-ink-2">
                  Jour
                </th>
                {series.map((part) => (
                  <th
                    key={part.id}
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-ink-2"
                  >
                    {part.label}
                  </th>
                ))}
                {stacked && (
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-2">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-t border-rule">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-2">
                    {formatDay(day.date)}
                  </th>
                  {series.map((part) => (
                    <td key={part.id} className="px-3 py-1.5 text-right">
                      {formatCount(part.value(day))}
                    </td>
                  ))}
                  {stacked && (
                    <td className="px-3 py-1.5 text-right">{formatCount(totalOf(day))}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
