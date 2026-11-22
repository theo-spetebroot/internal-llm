import { readStorage, writeStorage } from '@/lib/storage';

// Keep in sync with public/theme-init.js, which applies the theme before React loads.
export const THEME_STORAGE_KEY = 'internal-llm:theme';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function isThemePreference(value: string | null): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

export function readThemePreference(): ThemePreference {
  const stored = readStorage(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  writeStorage(THEME_STORAGE_KEY, preference);
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
