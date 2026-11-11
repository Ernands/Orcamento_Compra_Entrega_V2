import { lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/login-page';
import { AppShell } from './app-shell';
import {
  AuthorizedHomeRedirect,
  RequireCapability,
  RequirePasswordChanged,
  RequireSession,
} from './guards';
import { SessionProvider } from './session-provider';

// Each protected page is loaded on demand to keep the initial app bundle lightweight.
const AccessPage = lazy(() => import('../pages/access-page').then((module) => ({ default: module.AccessPage })));
const AdminReferenceAuditPage = lazy(() => import('../pages/admin-reference-audit-page').then((module) => ({ default: module.AdminReferenceAuditPage })));
const ChangePasswordPage = lazy(() => import('../pages/change-password-page').then((module) => ({ default: module.ChangePasswordPage })));
const ChecklistMasterPage = lazy(() => import('../pages/checklist-master-page').then((module) => ({ default: module.ChecklistMasterPage })));
const DashboardPage = lazy(() => import('../pages/dashboard-page').then((module) => ({ default: module.DashboardPage })));
const BudgetForecastDashboardPage = lazy(() => import('../pages/budget-forecast-dashboard-page').then((module) => ({ default: module.BudgetForecastDashboardPage })));
const FinancialCompositionPage = lazy(() => import('../pages/financial-composition-page').then((module) => ({ default: module.FinancialCompositionPage })));
const FinancePage = lazy(() => import('../pages/finance-page').then((module) => ({ default: module.FinancePage })));
const FinanceDocumentAuditPage = lazy(() => import('../pages/finance-document-audit-page').then((module) => ({ default: module.FinanceDocumentAuditPage })));
const FinancePaymentsPage = lazy(() => import('../pages/finance-payments-page').then((module) => ({ default: module.FinancePaymentsPage })));
const FinanceAccountReconciliationPage = lazy(() => import('../pages/finance-account-reconciliation-page').then((module) => ({ default: module.FinanceAccountReconciliationPage })));
const ManagerialReimbursementPage = lazy(() => import('../pages/managerial-reimbursement-page').then((module) => ({ default: module.ManagerialReimbursementPage })));
const FinanceStoreDetailPage = lazy(() => import('../pages/finance-store-detail-page').then((module) => ({ default: module.FinanceStoreDetailPage })));
const WorksPage = lazy(() => import('../pages/works-page').then((module) => ({ default: module.WorksPage })));
const PendingItemsPage = lazy(() => import('../pages/pending-items-page').then((module) => ({ default: module.PendingItemsPage })));
const StoreAttachmentsPage = lazy(() => import('../pages/store-attachments-page').then((module) => ({ default: module.StoreAttachmentsPage })));
const StoreImplementationPage = lazy(() => import('../pages/store-implementation-page').then((module) => ({ default: module.StoreImplementationPage })));
const StoreSummaryNeedsPage = lazy(() => import('../pages/store-summary-needs-page').then((module) => ({ default: module.StoreSummaryNeedsPage })));
const StoreWorkspacePage = lazy(() => import('../pages/store-workspace-page').then((module) => ({ default: module.StoreWorkspacePage })));
const StoresPage = lazy(() => import('../pages/stores-page').then((module) => ({ default: module.StoresPage })));
const SuppliersPage = lazy(() => import('../pages/suppliers-page').then((module) => ({ default: module.SuppliersPage })));
const SupplyComparisonPage = lazy(() => import('../pages/supply-comparison-page').then((module) => ({ default: module.SupplyComparisonPage })));
const SupplyItemsPage = lazy(() => import('../pages/supply-items-page').then((module) => ({ default: module.SupplyItemsPage })));
const SupplyPlannedBudgetPage = lazy(() => import('../pages/supply-planned-budget-page').then((module) => ({ default: module.SupplyPlannedBudgetPage })));
const SupplyPlannedBudgetDetailPage = lazy(() => import('../pages/supply-planned-budget-detail-page').then((module) => ({ default: module.SupplyPlannedBudgetDetailPage })));
const SupplyItemDetailPage = lazy(() => import('../pages/supply-item-detail-page').then((module) => ({ default: module.SupplyItemDetailPage })));
const SupplyNeedsPage = lazy(() => import('../pages/supply-needs-page').then((module) => ({ default: module.SupplyNeedsPage })));
const SupplyPurchasesPage = lazy(() => import('../pages/supply-purchases-page').then((module) => ({ default: module.SupplyPurchasesPage })));
const SupplyQuotesPage = lazy(() => import('../pages/supply-quotes-page').then((module) => ({ default: module.SupplyQuotesPage })));


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
                  <Navigate to="/dashboard/previsao-orcamentaria" replace />
                </RequireCapability>
              }
            />
            <Route
              path="dashboard/previsao-orcamentaria"
              element={
                <RequireCapability capability="dashboard.view">
                  <RequireCapability capability="finance.overview_view">
                    <RequireCapability capability="dashboard.budget_forecast_view">
                      <BudgetForecastDashboardPage />
                    </RequireCapability>
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="dashboard/composicao-financeira"
              element={
                <RequireCapability capability="dashboard.view">
                  <RequireCapability capability="finance.overview_view">
                    <RequireCapability capability="dashboard.financial_composition_view">
                      <FinancialCompositionPage />
                    </RequireCapability>
                  </RequireCapability>
                </RequireCapability>
              }
            />
            <Route
              path="dashboard/reembolso"
              element={
                <RequireCapability capability="dashboard.view">
                  <RequireCapability capability="finance.overview_view">
                    <RequireCapability capability="dashboard.reimbursement_view">
                      <ManagerialReimbursementPage />
                    </RequireCapability>
                  </RequireCapability>
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
              path="financeiro/conferencia-compras-obras"
              element={
                <RequireCapability capability="finance.view">
                  <RequireCapability capability="finance.document_audit_view">
                    <FinanceDocumentAuditPage />
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
              path="administracao/auditoria"
              element={
                <RequireCapability capability="access.view">
                  <RequireCapability capability="access.audit_view">
                    <AdminReferenceAuditPage />
                  </RequireCapability>
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
