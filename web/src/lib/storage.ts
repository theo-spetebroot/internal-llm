/**
 * localStorage access that never throws: storage can be unavailable (private mode, blocked
 * site data). Only used for per-browser conveniences (theme, sidebar state).
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted: the value still applies to the current page.
  }
}
