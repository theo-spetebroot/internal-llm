import { createContext, useContext, type ReactNode } from 'react';

export interface ShellContextValue {
  /**
   * Buttons a page header shows when the sidebar is not docked (mobile drawer, or desktop
   * with the sidebar collapsed): navigation on the left, new conversation on the right.
   * Null while the sidebar is docked.
   */
  leading: ReactNode;
  trailing: ReactNode;
}

export const ShellContext = createContext<ShellContextValue>({ leading: null, trailing: null });

export function useShell(): ShellContextValue {
  return useContext(ShellContext);
}
