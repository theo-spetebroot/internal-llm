import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query currently matches, updated live. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Tailwind's `md` breakpoint: the sidebar is docked from here, a drawer below. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 48rem)';
