import { assertPurchaseEventParity } from '../../domain/finance-purchase-event-parity';
import { assertPurchaseAdjustmentParity } from '../../domain/finance-purchase-adjustment-parity';
import {
  listFinancePurchaseAdjustmentsPage,
  type FinancePurchaseAdjustmentPage,
  type FinancePurchaseAdjustmentSnapshot,
} from './finance-purchase-adjustment-repository';
import { auditUnifiedFinanceProjection, type FinanceAuditReport } from '../../domain/finance-projection-audit';
import type { PurchaseV2 } from '../../domain/purchase-v2-types';
import type { WorkService } from '../../domain/works-types';
import type { UnifiedFinancePaymentRow } from '../../domain/finance-payments';
import {
  listFinancePurchaseEventsPage,
  type FinancePurchaseEvent,
  type FinancePurchaseEventsPage,
} from './finance-purchase-events-repository';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export type SqlParityStatus = 'matched' | 'incomplete' | 'failed';
export interface FinancePreviewParityReport {
  domain: FinanceAuditReport;
  sqlStatus: SqlParityStatus;
  sqlCheckedEvents: number;
  excludedPurchases: number;
  excludedPayments: number;
  sqlDetail: string;
  adjustmentSqlStatus: SqlParityStatus;
  adjustmentSqlChecked: number;
  adjustmentSqlDetail: string;
  /** The full four-stage conservation audit and SQL event parity both passed. */
  passed: boolean;
}

async function checkAdjustmentParity(
  purchases: PurchaseV2[],
): Promise<{
  adjustmentSqlStatus: SqlParityStatus;
  adjustmentSqlChecked: number;
  adjustmentSqlDetail: string;
}> {
  const first = await listFinancePurchaseAdjustmentsPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  if (!first.isComplete) return {
    adjustmentSqlStatus: 'incomplete',
    adjustmentSqlChecked: 0,
    adjustmentSqlDetail: first.invalidCount + ' ajuste(s) com histórico inconsistente no SQL.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    adjustmentSqlStatus: 'incomplete',
    adjustmentSqlChecked: 0,
    adjustmentSqlDetail: 'Quantidade de ajustes excede o limite de conferência.',
  };
  const rows: FinancePurchaseAdjustmentSnapshot[] = [...first.rows];
  let problem: string | null = null;
  const sameTotals = (next: FinancePurchaseAdjustmentPage) =>
    next.totalCount === first.totalCount &&
    next.invalidCount === first.invalidCount &&
    next.grossCents === first.grossCents &&
    next.netCents === first.netCents &&
    next.refundedCents === first.refundedCents &&
    next.isComplete === first.isComplete;
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchaseAdjustmentsPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      problem = 'A leitura de ajustes mudou durante a paginação.';
      break;
    }
    rows.push(...next.rows);
  }
  if (!problem) {
    try {
      assertPurchaseAdjustmentParity(purchases, first, rows);
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Divergência na conciliação dos ajustes.';
    }
  }
  return {
    adjustmentSqlStatus: problem ? 'failed' : 'matched',
    adjustmentSqlChecked: rows.length,
    adjustmentSqlDetail: problem || rows.length +
      ' ajuste(s) conciliados com o domínio financeiro atual, em centavos.',
  };
}

/**
 * Preview-only on-demand shadow comparison, with no write path.
 * All SQL pages are checked against buildFinancePaymentEvents (the current
 * production calculation). "Incomplete" is NEVER treated as matched.
 */
export async function runFinancePreviewParity(
  purchases: PurchaseV2[],
  works: WorkService[],
  displayedRows?: UnifiedFinancePaymentRow[],
): Promise<FinancePreviewParityReport> {
  const domain = auditUnifiedFinanceProjection(purchases, works, displayedRows);
  const [first, adjustmentSql] = await Promise.all([
    listFinancePurchaseEventsPage({ page: 1, pageSize: PAGE_SIZE, allowIncomplete: true }),
    checkAdjustmentParity(purchases),
  ]);

  const base = {
    domain,
    excludedPurchases: first.unsupportedPurchaseCount,
    excludedPayments: first.unsupportedPaymentCount,
    ...adjustmentSql,
  };

  if (!first.isComplete) {
    return {
      ...base,
      sqlStatus: 'incomplete',
      sqlCheckedEvents: 0,
      sqlDetail: 'Consulta SQL parcial: ' + first.unsupportedPurchaseCount +
        ' compra(s) e ' + first.unsupportedPaymentCount +
        ' pagamento(s) excluídos por ajustes ou limites de parcelamento.',
      passed: false,
    };
  }

  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) {
    return {
      ...base,
      sqlStatus: 'incomplete',
      sqlCheckedEvents: 0,
      sqlDetail: 'Quantidade de páginas ultrapassa o limite de segurança da comparação.',
      passed: false,
    };
  }

  const pageRows: FinancePurchaseEvent[] = [...first.rows];
  let mismatch: string | null = null;
  const sameTotals = (page: FinancePurchaseEventsPage) =>
    page.totalCount === first.totalCount &&
    page.paidCents === first.paidCents &&
    page.plannedCents === first.plannedCents &&
    page.grossPaidCents === first.grossPaidCents &&
    page.refundedCents === first.refundedCents &&
    page.isComplete === first.isComplete &&
    page.unsupportedPaymentCount === first.unsupportedPaymentCount &&
    page.unsupportedPurchaseCount === first.unsupportedPurchaseCount;

  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchaseEventsPage({ page, pageSize: PAGE_SIZE, allowIncomplete: true });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      mismatch = 'A paginação do SQL variou enquanto a conferência estava em andamento.';
      break;
    }
    pageRows.push(...next.rows);
  }

  if (!mismatch) {
    try {
      assertPurchaseEventParity(purchases, first, pageRows);
    } catch (error) {
      mismatch = error instanceof Error ? error.message : 'Divergência desconhecida no SQL.';
    }
  }

  const sqlStatus: SqlParityStatus = mismatch ? 'failed' : 'matched';
  return {
    ...base,
    sqlStatus,
    sqlCheckedEvents: pageRows.length,
    sqlDetail: mismatch || 'Eventos SQL comparados, sem divergência, com o cálculo atual.',
    passed: domain.passed && sqlStatus === 'matched' &&
      adjustmentSql.adjustmentSqlStatus === 'matched',
  };
}
