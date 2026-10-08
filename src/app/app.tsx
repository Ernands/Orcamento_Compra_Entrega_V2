import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccessPage } from '../pages/access-page';
import { ChangePasswordPage } from '../pages/change-password-page';
import { LoginPage } from '../pages/login-page';
import { ChecklistMasterPage } from '../pages/checklist-master-page';
import { DashboardPage } from '../pages/dashboard-page';
import { FinancePage } from '../pages/finance-page';
import { FinancePaymentsPage } from '../pages/finance-payments-page';
import { FinanceAccountReconciliationPage } from '../pages/finance-account-reconciliation-page';
import { FinanceStoreDetailPage } from '../pages/finance-store-detail-page';
import { WorksPage } from '../pages/works-page';
import { PendingItemsPage } from '../pages/pending-items-page';
import { StoreAttachmentsPage } from '../pages/store-attachments-page';
import { StoreImplementationPage } from '../pages/store-implementation-page';
import { StoreSummaryNeedsPage } from '../pages/store-summary-needs-page';
import { StoreWorkspacePage } from '../pages/store-workspace-page';
import { StoresPage } from '../pages/stores-page';
import { SuppliersPage } from '../pages/suppliers-page';
import { SupplyComparisonPage } from '../pages/supply-comparison-page';
import { SupplyItemsPage } from '../pages/supply-items-page';
import { SupplyPlannedBudgetPage } from '../pages/supply-planned-budget-page';
import { SupplyPlannedBudgetDetailPage } from '../pages/supply-planned-budget-detail-page';
import { SupplyItemDetailPage } from '../pages/supply-item-detail-page';
import { SupplyNeedsPage } from '../pages/supply-needs-page';
import { SupplyPurchasesPage } from '../pages/supply-purchases-page';
import { SupplyQuotesPage } from '../pages/supply-quotes-page';
import { AppShell } from './app-shell';
import {
  AuthorizedHomeRedirect,
  RequireCapability,
  RequirePasswordChanged,
  RequireSession,
} from './guards';
import { SessionProvider } from './session-provider';

function SupplyPurchasesRoute() {
  useEffect(() => {
    const prepareBulkForm = (form: HTMLFormElement) => {
      if (form.dataset.bulkDefaultsWatcher !== 'true') {
        form.dataset.bulkDefaultsWatcher = 'true';
        form.addEventListener('change', (event) => {
          const target = event.target;
          if (
            event.isTrusted
            && target instanceof HTMLInputElement
            && target.type === 'checkbox'
            && target.closest('.purchase-v2-bulk-purchase-line')
          ) {
            form.dataset.bulkDefaultsManual = 'true';
          }
        });
      }

      if (form.dataset.bulkDefaultsManual === 'true') return;

      const selectAllButton = Array.from(form.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.includes('Selecionar todos disponiveis'),
      );
      if (!selectAllButton || selectAllButton.disabled) return;

      const summary = Array.from(form.querySelectorAll<HTMLSpanElement>('span')).find((span) =>
        /\d+\s+selecionados de\s+\d+\s+disponiveis/i.test(span.textContent || ''),
      );
      const match = summary?.textContent?.match(/(\d+)\s+selecionados de\s+(\d+)\s+disponiveis/i);
      if (!match) return;

      const selectedCount = Number(match[1]);
      const eligibleCount = Number(match[2]);
      if (eligibleCount > 0 && selectedCount < eligibleCount) selectAllButton.click();
    };

    const selectEligibleBulkLines = () => {
      document
        .querySelectorAll<HTMLFormElement>(
          'details.purchase-v2-new-operation--bulk[open] form.purchase-v2-bulk-purchase',
        )
        .forEach(prepareBulkForm);
    };

    selectEligibleBulkLines();
    const observer = new MutationObserver(() => queueMicrotask(selectEligibleBulkLines));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, []);

  return <SupplyPurchasesPage />;
}

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
            <Route index element={<AuthorizedHomeRedirect />} />
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
              path="suprimentos/orcamento-previsto"
              element={
                <RequireCapability capability="planned_budget.view">
                  <SupplyPlannedBudgetPage />
                </RequireCapability>
              }
            />
            <Route
              path="suprimentos/orcamento-previsto/:budgetItemId"
              element={
                <RequireCapability capability="planned_budget.view">
                  <SupplyPlannedBudgetDetailPage />
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
              path="suprimentos/compras"
              element={
                <RequireCapability capability="purchases.view">
                  <SupplyPurchasesRoute />
                </RequireCapability>
              }
            />
            <Route
              path="obras"
              element={
                <RequireCapability capability="works.view">
                  <WorksPage />
                </RequireCapability>
              }
            />
            <Route
              path="financeiro"
              element={
                <RequireCapability capability="finance.view">
                  <FinancePage />
                </RequireCapability>
              }
            />
            <Route
              path="financeiro/pagamentos"
              element={
                <RequireCapability capability="finance.view">
                  <RequireCapability capability="finance.payments_view">
                    <FinancePaymentsPage />
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="financeiro/conciliacao-conta"
              element={
                <RequireCapability capability="finance.view">
                  <RequireCapability capability="finance.payments_view">
                    <RequireCapability capability="finance.account_reconciliation_view">
                      <FinanceAccountReconciliationPage />
                    </RequireCapability>
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="financeiro/lojas/:storeId"
              element={
                <RequireCapability capability="finance.view">
                  <RequireCapability capability="finance.store_detail_view">
                    <FinanceStoreDetailPage />
                  </RequireCapability>
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
