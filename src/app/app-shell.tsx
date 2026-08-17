import {
  Building2,
  Boxes,
  ClipboardCheck,
  ChartNoAxesCombined,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconButton } from '../components/ui';
import { useSession } from './session-provider';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Visao Geral',
  '/dashboard/implantacao': 'Dashboard de Implantacao',
  '/dashboard/suprimentos': 'Dashboard de Suprimentos',
  '/lojas': 'Lojas',
  '/acessos': 'Acessos',
  '/alterar-senha': 'Alterar senha',
  '/implantacao/pendencias': 'Pendencias',
  '/implantacao/checklist-mestre': 'Checklist Mestre',
  '/suprimentos/itens': 'Itens',
  '/suprimentos/necessidades': 'Necessidades',
  '/suprimentos/fornecedores': 'Fornecedores',
  '/suprimentos/cotacoes': 'Cotacoes',
  '/suprimentos/comparativo': 'Comparativo',
};

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { viewer, can, signOut } = useSession();
  const location = useLocation();
  const canViewSupply = can('items.view') || can('suppliers.view') || can('quotes.view');
  const title = location.pathname.startsWith('/suprimentos/itens/')
    ? 'Detalhe do item'
    : location.pathname.startsWith('/lojas/')
      ? location.pathname.endsWith('/anexos')
        ? 'Anexos da loja'
        : location.pathname.endsWith('/resumo-necessidades')
          ? 'Resumo e Necessidades'
          : 'Implantacao da loja'
      : routeTitles[location.pathname] || 'Implanta 27';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const navigation = (
    <>
      <div className="sidebar__brand">
        <span className="brand-mark">
          <Building2 size={23} />
        </span>
        <span>
          <strong>Implanta 27</strong>
          <small>Implantacao, Compra & entrega</small>
        </span>
      </div>
      <nav className="sidebar__nav" aria-label="Navegacao principal">
        {can('dashboard.view') && (
          <>
            <span className="nav-section">Dashboard</span>
            <NavLink to="/dashboard" end onClick={() => setMobileOpen(false)}>
              <LayoutDashboard size={19} />
              Visao Geral
            </NavLink>
            <NavLink to="/dashboard/implantacao" onClick={() => setMobileOpen(false)}>
              <Building2 size={19} />
              Implantacao
            </NavLink>
            {canViewSupply && (
              <NavLink to="/dashboard/suprimentos" onClick={() => setMobileOpen(false)}>
                <Boxes size={19} />
                Suprimentos
              </NavLink>
            )}
          </>
        )}
        <span className={`nav-section${can('dashboard.view') ? ' nav-section--spaced' : ''}`}>
          Implantacao
        </span>
        {can('stores.view') && (
          <NavLink to="/lojas" onClick={() => setMobileOpen(false)}>
            <Store size={19} />
            Lojas
          </NavLink>
        )}
        {can('checklists.view') && (
          <NavLink to="/implantacao/checklist-mestre" onClick={() => setMobileOpen(false)}>
            <ClipboardCheck size={19} />
            Checklist Mestre
          </NavLink>
        )}
        {can('implementation.view') && (
          <NavLink to="/implantacao/pendencias" onClick={() => setMobileOpen(false)}>
            <ListTodo size={19} />
            Pendencias
          </NavLink>
        )}
        {canViewSupply && (
          <span className="nav-section nav-section--spaced">Suprimentos</span>
        )}
        {can('items.view') && (
          <NavLink to="/suprimentos/itens" onClick={() => setMobileOpen(false)}>
            <PackageSearch size={19} />
            Itens
          </NavLink>
        )}
        {canViewSupply && can('needs.view') && (
          <NavLink to="/suprimentos/necessidades" onClick={() => setMobileOpen(false)}>
            <ListTodo size={19} />
            Necessidades
          </NavLink>
        )}
        {can('suppliers.view') && (
          <NavLink to="/suprimentos/fornecedores" onClick={() => setMobileOpen(false)}>
            <Truck size={19} />
            Fornecedores
          </NavLink>
        )}
        {can('quotes.view') && (
          <>
            <NavLink to="/suprimentos/cotacoes" onClick={() => setMobileOpen(false)}>
              <ReceiptText size={19} />
              Cotacoes
            </NavLink>
            <NavLink to="/suprimentos/comparativo" onClick={() => setMobileOpen(false)}>
              <ChartNoAxesCombined size={19} />
              Comparativo
            </NavLink>
          </>
        )}
        {can('access.view') && (
          <>
            <span className="nav-section nav-section--spaced">Administracao</span>
            <NavLink to="/acessos" onClick={() => setMobileOpen(false)}>
              <ShieldCheck size={19} />
              Acessos
            </NavLink>
          </>
        )}
      </nav>
      <div className="sidebar__account">
        <span className="avatar" aria-hidden="true">
          {viewer?.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-copy">
          <strong>{viewer?.name}</strong>
          <small>{viewer?.profile.name}</small>
        </span>
        <NavLink
          className="icon-button"
          to="/alterar-senha"
          title="Alterar senha"
          aria-label="Alterar senha"
          onClick={() => setMobileOpen(false)}
        >
          <KeyRound size={18} />
        </NavLink>
        <IconButton label="Sair" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={18} />
        </IconButton>
      </div>
    </>
  );

  return (
    <div className="app-layout">
      <aside className="sidebar">{navigation}</aside>
      {mobileOpen && (
        <div className="mobile-nav-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <aside className="mobile-nav" onMouseDown={(event) => event.stopPropagation()}>
            <IconButton label="Fechar menu" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </IconButton>
            {navigation}
          </aside>
        </div>
      )}
      <div className="app-main">
        <header className="topbar">
          <IconButton label="Abrir menu" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </IconButton>
          <div>
            <span className="topbar__eyebrow">Implanta 27</span>
            <h1>{title}</h1>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
