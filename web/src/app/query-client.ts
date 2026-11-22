import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry network failures and 5xx, never 4xx: they would answer the same again.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && !(error instanceof ApiError && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}
