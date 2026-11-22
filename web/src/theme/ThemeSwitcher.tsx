import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { RadioGroup } from 'radix-ui';

import { cn } from '@/lib/utils';

import { THEME_PREFERENCES, type ThemePreference } from './theme';
import { useTheme } from './theme-context';

const OPTIONS: Record<ThemePreference, { label: string; Icon: LucideIcon }> = {
  light: { label: 'Clair', Icon: Sun },
  dark: { label: 'Sombre', Icon: Moon },
  system: { label: 'Système', Icon: Monitor },
};

function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

/** Light / dark / system selector: a radio group (arrow keys move the selection). */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <RadioGroup.Root
      aria-label="Thème"
      value={preference}
      onValueChange={(value) => {
        if (isThemePreference(value)) setPreference(value);
      }}
      orientation="horizontal"
      className={cn(
        'grid grid-cols-3 gap-0.5 rounded-[10px] border border-rule p-[3px]',
        className,
      )}
    >
      {THEME_PREFERENCES.map((value) => {
        const { label, Icon } = OPTIONS[value];
        return (
          <RadioGroup.Item
            key={value}
            value={value}
            aria-label={label}
            title={label}
            // 44px tall on touch screens, more compact once the sidebar is docked.
            className="flex h-11 cursor-pointer items-center justify-center rounded-[7px] text-ink-2 transition-colors hover:text-ink data-[state=checked]:bg-active data-[state=checked]:text-ink md:h-8"
          >
            <Icon className="size-4" strokeWidth={1.7} aria-hidden="true" />
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
