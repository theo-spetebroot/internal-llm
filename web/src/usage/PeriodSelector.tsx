import { RadioGroup } from 'radix-ui';

import { parsePeriod, USAGE_PERIODS, type UsagePeriod } from './usage-period';

interface PeriodSelectorProps {
  value: UsagePeriod;
  onChange: (days: UsagePeriod) => void;
}

/** 7 / 30 / 90 days: a radio group (arrow keys move the selection). */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <RadioGroup.Root
      aria-label="Période"
      value={String(value)}
      onValueChange={(next) => {
        onChange(parsePeriod(next));
      }}
      orientation="horizontal"
      className="inline-flex gap-0.5 rounded-[10px] border border-rule bg-raised p-[3px]"
    >
      {USAGE_PERIODS.map((days) => (
        <RadioGroup.Item
          key={days}
          value={String(days)}
          aria-label={`${days} jours`}
          className="h-10 min-w-14 cursor-pointer rounded-[7px] px-3.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink data-[state=checked]:bg-ink data-[state=checked]:text-paper"
        >
          {days} j
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
