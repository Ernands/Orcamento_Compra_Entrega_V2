import {
  Building2,
  Boxes,
  ChevronRight,
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
  ShoppingCart,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  '/suprimentos/compras': 'Compras',
  '/suprimentos/comparativo': 'Comparativo',
};

const SECTION_STORAGE = {
  implantation: 'implanta27.sidebar.implantation',
  supply: 'implanta27.sidebar.supply',
  administration: 'implanta27.sidebar.administration',
} as const;

function readSectionState(key: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function persistSectionState(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // O menu continua funcional mesmo quando o navegador bloqueia storage local.
  }
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [implantationOpen, setImplantationOpen] = useState(() =>
    readSectionState(SECTION_STORAGE.implantation),
  );
  const [supplyOpen, setSupplyOpen] = useState(() => readSectionState(SECTION_STORAGE.supply));
  const [administrationOpen, setAdministrationOpen] = useState(() =>
    readSectionState(SECTION_STORAGE.administration),
  );
  const { viewer, can, signOut } = useSession();
  const location = useLocation();
  const canViewSupply =
    can('items.view') || can('suppliers.view') || can('quotes.view') || can('purchases.view' as never);
  const canViewImplementationSection =
    can('stores.view') || can('checklists.view') || can('implementation.view');
  const title = location.pathname.startsWith('/suprimentos/itens/')
    ? 'Detalhe do item'
    : location.pathname.startsWith('/lojas/')
      ? location.pathname.endsWith('/anexos')
        ? 'Anexos da loja'
        : location.pathname.endsWith('/resumo-necessidades')
          ? 'Resumo e Necessidades'
          : 'Implantacao da loja'
      : routeTitles[location.pathname] || 'Implanta 27';

  useEffect(() => {
    if (location.pathname.startsWith('/lojas') || location.pathname.startsWith('/implantacao/')) {
      setImplantationOpen(true);
      persistSectionState(SECTION_STORAGE.implantation, true);
    }
    if (location.pathname.startsWith('/suprimentos/')) {
      setSupplyOpen(true);
      persistSectionState(SECTION_STORAGE.supply, true);
    }
    if (location.pathname.startsWith('/acessos')) {
      setAdministrationOpen(true);
      persistSectionState(SECTION_STORAGE.administration, true);
    }
  }, [location.pathname]);

  const toggleImplantation = () => {
    setImplantationOpen((current) => {
      const next = !current;
      persistSectionState(SECTION_STORAGE.implantation, next);
      return next;
    });
  };

  const toggleSupply = () => {
    setSupplyOpen((current) => {
      const next = !current;
      persistSectionState(SECTION_STORAGE.supply, next);
      return next;
    });
  };

  const toggleAdministration = () => {
    setAdministrationOpen((current) => {
      const next = !current;
      persistSectionState(SECTION_STORAGE.administration, next);
      return next;
    });
  };

  const sectionButtonStyle = (spaced: boolean) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: 0,
    background: 'transparent',
    textAlign: 'left' as const,
    cursor: 'pointer',
    marginTop: spaced ? 25 : 0,
  });

  const sectionChevronStyle = (open: boolean) => ({
    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 160ms ease',
  });

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

        {canViewImplementationSection && (
          <>
            <button
              type="button"
              className="nav-section"
              style={sectionButtonStyle(can('dashboard.view'))}
              aria-expanded={implantationOpen}
              onClick={toggleImplantation}
            >
              <span>Implantacao</span>
              <ChevronRight size={15} style={sectionChevronStyle(implantationOpen)} />
            </button>
            {implantationOpen && (
              <>
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
              </>
            )}
          </>
        )}

        {canViewSupply && (
          <>
            <button
              type="button"
              className="nav-section"
              style={sectionButtonStyle(true)}
              aria-expanded={supplyOpen}
              onClick={toggleSupply}
            >
              <span>Suprimentos</span>
              <ChevronRight size={15} style={sectionChevronStyle(supplyOpen)} />
            </button>
            {supplyOpen && (
              <>
                {can('items.view') && (
                  <NavLink to="/suprimentos/itens" onClick={() => setMobileOpen(false)}>
                    <PackageSearch size={19} />
                    Itens
                  </NavLink>
                )}
                {can('needs.view') && (
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
                  <NavLink to="/suprimentos/cotacoes" onClick={() => setMobileOpen(false)}>
                    <ReceiptText size={19} />
                    Cotacoes
                  </NavLink>
                )}
                {can('purchases.view' as never) && (
                  <NavLink to="/suprimentos/compras" onClick={() => setMobileOpen(false)}>
                    <ShoppingCart size={19} />
                    Compras
                  </NavLink>
                )}
                {can('quotes.view') && (
                  <NavLink to="/suprimentos/comparativo" onClick={() => setMobileOpen(false)}>
                    <ChartNoAxesCombined size={19} />
                    Comparativo
                  </NavLink>
                )}
              </>
            )}
          </>
        )}

        {can('access.view') && (
          <>
            <button
              type="button"
              className="nav-section"
              style={sectionButtonStyle(true)}
              aria-expanded={administrationOpen}
              onClick={toggleAdministration}
            >
              <span>Administracao</span>
              <ChevronRight size={15} style={sectionChevronStyle(administrationOpen)} />
            </button>
            {administrationOpen && (
              <NavLink to="/acessos" onClick={() => setMobileOpen(false)}>
                <ShieldCheck size={19} />
                Acessos
              </NavLink>
            )}
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
