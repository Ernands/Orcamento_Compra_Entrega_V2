import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccessPage } from '../pages/access-page';
import { ChangePasswordPage } from '../pages/change-password-page';
import { LoginPage } from '../pages/login-page';
import { ChecklistMasterPage } from '../pages/checklist-master-page';
import { PendingItemsPage } from '../pages/pending-items-page';
import { StoreAttachmentsPage } from '../pages/store-attachments-page';
import { StoreImplementationPage } from '../pages/store-implementation-page';
import { StoreSummaryNeedsPage } from '../pages/store-summary-needs-page';
import { StoreWorkspacePage } from '../pages/store-workspace-page';
import { StoresPage } from '../pages/stores-page';
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
            <Route index element={<Navigate to="/lojas" replace />} />
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
