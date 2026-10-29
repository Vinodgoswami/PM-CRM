import { can, type Permission } from '@salescrm/auth/permissions';
import { Skeleton } from '@salescrm/ui';
import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../features/auth/api';
import { ForbiddenPage } from '../pages/ForbiddenPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) {
    return (
      <div className="p-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** Hides pages a role cannot use. The API enforces the same matrix; this is only UX. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { data } = useSession();
  if (!data || !can(data.user, permission)) return <ForbiddenPage />;
  return children;
}
