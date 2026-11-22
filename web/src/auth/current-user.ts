import { createContext, useContext } from 'react';

import type { User } from '@/api/client';

/** Provided by RequireAuth: pages behind it always have a user, even while logging out. */
export const CurrentUserContext = createContext<User | null>(null);

export function useCurrentUser(): User {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used behind RequireAuth');
  return user;
}
