import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useMediaQuery } from '@/lib/use-media-query';

import {
  DARK_MEDIA_QUERY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
} from './theme';
import { ThemeContext, type ThemeContextValue } from './theme-context';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readThemePreference);
  const systemDark = useMediaQuery(DARK_MEDIA_QUERY);
  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      setPreference: (next: ThemePreference) => {
        writeThemePreference(next);
        setPreferenceState(next);
      },
    }),
    [preference, theme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
