import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Capability } from '../domain/types';
import { LoadingScreen } from '../components/ui';
import { useSession } from './session-provider';

export function authorizedHomePath(capabilities: Capability[]): string {
  const has = (capability: Capability) => capabilities.includes(capability);
  if (has('dashboard.view')) return '/dashboard';
  if (has('stores.view')) return '/lojas';
  if (has('implementation.view')) return '/implantacao/pendencias';
  if (has('items.view')) return '/suprimentos/itens';
  if (has('planned_budget.view')) return '/suprimentos/orcamento-previsto';
  if (has('needs.view')) return '/suprimentos/necessidades';
  if (has('suppliers.view')) return '/suprimentos/fornecedores';
  if (has('quotes.view')) return '/suprimentos/cotacoes';
  if (has('purchases.view')) return '/suprimentos/compras';
  if (has('works.view')) return '/obras';
  if (has('finance.view')) return '/financeiro';
  if (has('access.view')) return '/acessos';
  return '/alterar-senha';
}

export function AuthorizedHomeRedirect() {
  const { viewer } = useSession();
  return <Navigate to={authorizedHomePath(viewer?.capabilities || [])} replace />;
}

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
  const { can, viewer } = useSession();
  return can(capability) ? (
    children
  ) : (
    <Navigate to={authorizedHomePath(viewer?.capabilities || [])} replace />
  );
}

export function RequirePasswordChanged({ children }: { children: ReactNode }) {
  const { viewer } = useSession();
  const location = useLocation();

  if (viewer?.mustChangePassword && location.pathname !== '/alterar-senha') {
    return <Navigate to="/alterar-senha" replace />;
  }

  return children;
}
