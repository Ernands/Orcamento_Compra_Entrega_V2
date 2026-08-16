import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccessPage } from '../pages/access-page';
import { ChangePasswordPage } from '../pages/change-password-page';
import { LoginPage } from '../pages/login-page';
import { StoreDetailPage } from '../pages/store-detail-page';
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
                  <StoreDetailPage />
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
