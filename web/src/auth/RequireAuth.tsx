import { Navigate, Outlet, useLocation } from 'react-router';

import { FullPageStatus } from '@/components/FullPageStatus';
import { Button } from '@/components/ui/button';

import { CurrentUserContext } from './current-user';
import { loginPath } from './safe-redirect';
import { useSession } from './session';

/** Renders the child routes for a logged-in user, otherwise sends them to the login page. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <FullPageStatus>
        <p role="status" className="text-sm text-ink-3">
          Chargement…
        </p>
      </FullPageStatus>
    );
  }

  if (session.isError) {
    return (
      <FullPageStatus>
        <div role="alert" className="flex flex-col items-center gap-4">
          <p className="max-w-sm font-serif text-xl">Le serveur est injoignable.</p>
          <Button
            variant="outline"
            disabled={session.isFetching}
            onClick={() => {
              void session.refetch();
            }}
          >
            Réessayer
          </Button>
        </div>
      </FullPageStatus>
    );
  }

  if (!session.data) {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }

  return (
    <CurrentUserContext value={session.data}>
      <Outlet />
    </CurrentUserContext>
  );
}
