import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Capability } from '../domain/types';
import { LoadingScreen } from '../components/ui';
import { useSession } from './session-provider';

export function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading, error } = useSession();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Validando acesso" />;
  if (!session || error) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { can } = useSession();
  return can(capability) ? children : <Navigate to="/lojas" replace />;
}

export function RequirePasswordChanged({ children }: { children: ReactNode }) {
  const { viewer } = useSession();
  const location = useLocation();

  if (viewer?.mustChangePassword && location.pathname !== '/alterar-senha') {
    return <Navigate to="/alterar-senha" replace />;
  }

  return children;
}
