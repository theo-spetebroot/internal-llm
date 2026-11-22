import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { setUnauthorizedHandler } from '@/api/client';
import { endSession } from '@/auth/session';
import { ThemeProvider } from '@/theme/ThemeProvider';

interface AppProvidersProps {
  queryClient: QueryClient;
  children: ReactNode;
}

export function AppProviders({ queryClient, children }: AppProvidersProps) {
  // Session expired while using the app: forget the user, RequireAuth sends them to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession(queryClient);
    });
    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
