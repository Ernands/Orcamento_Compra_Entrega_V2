import {
  Building2,
  ClipboardCheck,
  KeyRound,
  ListTodo,
  LogOut,
  Menu,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconButton } from '../components/ui';
import { useSession } from './session-provider';

const routeTitles: Record<string, string> = {
  '/lojas': 'Lojas',
  '/acessos': 'Acessos',
  '/alterar-senha': 'Alterar senha',
  '/implantacao/pendencias': 'Pendencias',
  '/implantacao/checklist-mestre': 'Checklist Mestre',
};

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { viewer, can, signOut } = useSession();
  const location = useLocation();
  const title = location.pathname.startsWith('/lojas/')
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
        <span className="nav-section">Implantacao</span>
        {can('stores.view') && (
          <NavLink to="/lojas" onClick={() => setMobileOpen(false)}>
            <Store size={19} />
            Lojas
          </NavLink>
        )}
        {can('implementation.view') && (
          <NavLink to="/implantacao/pendencias" onClick={() => setMobileOpen(false)}>
            <ListTodo size={19} />
            Pendencias
          </NavLink>
        )}
        {can('checklists.view') && (
          <NavLink to="/implantacao/checklist-mestre" onClick={() => setMobileOpen(false)}>
            <ClipboardCheck size={19} />
            Checklist Mestre
          </NavLink>
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
