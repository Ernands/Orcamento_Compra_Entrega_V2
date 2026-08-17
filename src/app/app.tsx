import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccessPage } from '../pages/access-page';
import { ChangePasswordPage } from '../pages/change-password-page';
import { LoginPage } from '../pages/login-page';
import { ChecklistMasterPage } from '../pages/checklist-master-page';
import { DashboardPage } from '../pages/dashboard-page';
import { PendingItemsPage } from '../pages/pending-items-page';
import { StoreAttachmentsPage } from '../pages/store-attachments-page';
import { StoreImplementationPage } from '../pages/store-implementation-page';
import { StoreSummaryNeedsPage } from '../pages/store-summary-needs-page';
import { StoreWorkspacePage } from '../pages/store-workspace-page';
import { StoresPage } from '../pages/stores-page';
import { SuppliersPage } from '../pages/suppliers-page';
import { SupplyComparisonPage } from '../pages/supply-comparison-page';
import { SupplyItemsPage } from '../pages/supply-items-page';
import { SupplyItemDetailPage } from '../pages/supply-item-detail-page';
import { SupplyNeedsPage } from '../pages/supply-needs-page';
import { SupplyQuotesPage } from '../pages/supply-quotes-page';
import { AppShell } from './app-shell';
import { RequireCapability, RequirePasswordChanged, RequireSession } from './guards';
import { SessionProvider } from './session-provider';

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireSession>
                <RequirePasswordChanged>
                  <AppShell />
                </RequirePasswordChanged>
              </RequireSession>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <RequireCapability capability="dashboard.view">
                  <DashboardPage view="overview" />
                </RequireCapability>
              }
            />
            <Route
              path="dashboard/implantacao"
              element={
                <RequireCapability capability="dashboard.view">
                  <DashboardPage view="implementation" />
                </RequireCapability>
              }
            />
            <Route
              path="dashboard/suprimentos"
              element={
                <RequireCapability capability="items.view">
                  <RequireCapability capability="dashboard.view">
                    <DashboardPage view="supply" />
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="lojas"
              element={
                <RequireCapability capability="stores.view">
                  <StoresPage />
                </RequireCapability>
              }
            />
            <Route
              path="lojas/:id"
              element={
                <RequireCapability capability="stores.view">
                  <StoreWorkspacePage />
                </RequireCapability>
              }
            >
              <Route index element={<Navigate to="implantacao" replace />} />
              <Route
                path="implantacao"
                element={
                  <RequireCapability capability="implementation.view">
                    <StoreImplementationPage />
                  </RequireCapability>
                }
              />
              <Route
                path="resumo-necessidades"
                element={
                  <RequireCapability capability="needs.view">
                    <StoreSummaryNeedsPage />
                  </RequireCapability>
                }
              />
              <Route
                path="anexos"
                element={
                  <RequireCapability capability="attachments.view">
                    <StoreAttachmentsPage />
                  </RequireCapability>
                }
              />
            </Route>
            <Route
              path="implantacao/pendencias"
              element={
                <RequireCapability capability="implementation.view">
                  <PendingItemsPage />
                </RequireCapability>
              }
            />
            <Route
              path="implantacao/checklist-mestre"
              element={
                <RequireCapability capability="checklists.view">
                  <ChecklistMasterPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/itens"
              element={
                <RequireCapability capability="items.view">
                  <SupplyItemsPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/itens/:itemId"
              element={
                <RequireCapability capability="items.view">
                  <SupplyItemDetailPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/necessidades"
              element={
                <RequireCapability capability="items.view">
                  <RequireCapability capability="needs.view">
                    <SupplyNeedsPage />
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/itens-necessidades"
              element={<Navigate to="/suprimentos/itens" replace />}
            />
            <Route
              path="suprimentos/fornecedores"
              element={
                <RequireCapability capability="suppliers.view">
                  <SuppliersPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/cotacoes"
              element={
                <RequireCapability capability="quotes.view">
                  <SupplyQuotesPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/comparativo"
              element={
                <RequireCapability capability="quotes.view">
                  <SupplyComparisonPage />
                </RequireCapability>
              }
            />
            <Route
              path="acessos"
              element={
                <RequireCapability capability="access.view">
                  <AccessPage />
                </RequireCapability>
              }
            />
            <Route path="alterar-senha" element={<ChangePasswordPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
