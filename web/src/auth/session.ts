import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError, api, type User } from '@/api/client';

export const sessionQueryKey = ['session'] as const;

/** The logged-in user, or null when there is no valid session. */
async function fetchSession(): Promise<User | null> {
  const { data, response } = await api.GET('/api/auth/me');
  if (response.status === 401) return null;
  if (!data) throw new ApiError(response.status);
  return data;
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    // Only changes on login, logout or expiry, which all update the cache explicitly.
    staleTime: Infinity,
  });
}

/**
 * Forgets the user (logout, expired session). The session is marked as gone first, so that
 * RequireAuth redirects before anything else re-renders; then every other cached user data
 * is dropped.
 */
export function endSession(queryClient: QueryClient): void {
  queryClient.setQueryData(sessionQueryKey, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionQueryKey[0],
  });
}

/** Same rules as the API's LoginRequest (email trimmed and lowercased). */
export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide.')),
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(256),
});

export type LoginFormInput = z.infer<typeof loginFormSchema>;

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: LoginFormInput): Promise<User> => {
      const { data, response } = await api.POST('/api/auth/login', { body: credentials });
      if (response.status === 401) throw new InvalidCredentialsError();
      if (!data) throw new ApiError(response.status);
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { response } = await api.POST('/api/auth/logout');
      if (!response.ok) throw new ApiError(response.status);
    },
    onSuccess: () => {
      endSession(queryClient);
    },
  });
}
