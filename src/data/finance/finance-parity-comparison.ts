import { assertPurchaseEventParity } from '../../domain/finance-purchase-event-parity';
import { assertPurchaseAdjustmentParity } from '../../domain/finance-purchase-adjustment-parity';
import { assertPurchaseUnscheduledParity } from '../../domain/finance-purchase-unscheduled-parity';
import { assertPurchaseStoreCostParity } from '../../domain/finance-purchase-store-cost-parity';
import { assertCombinedPurchaseParity } from '../../domain/finance-purchase-combined-parity';
import { assertPurchasePaymentOriginParity } from '../../domain/finance-purchase-payment-origin-parity';
import { assertFinancePaymentStoreParity } from '../../domain/finance-purchase-payment-store-parity';
import {
  listFinancePaymentStoreOriginsPage,
  type FinancePaymentStoreOriginSqlEvent,
  type FinancePaymentStoreOriginSqlPage,
} from './finance-purchase-payment-store-origins-repository';
import {
  listFinancePurchasePaymentOriginsPage,
  type FinancePurchaseOriginEvent,
} from './finance-purchase-payment-origins-repository';
import {
  listFinancePurchaseCombinedGroupsPage,
  type FinancePurchaseCombinedGroup,
  type FinancePurchaseCombinedPage,
} from './finance-purchase-combined-repository';
import {
  listFinancePurchaseStoreCostsPage,
  type FinancePurchaseOrderCostPage,
  type FinancePurchaseOrderCostRow,
} from './finance-purchase-store-costs-repository';
import {
  listFinancePurchaseUnscheduledPage,
  type FinancePurchaseUnscheduledPage,
  type FinancePurchaseUnscheduledRow,
} from './finance-purchase-unscheduled-repository';
import {
  listFinancePurchaseAdjustmentsPage,
  type FinancePurchaseAdjustmentPage,
  type FinancePurchaseAdjustmentSnapshot,
} from './finance-purchase-adjustment-repository';
import { auditUnifiedFinanceProjection, type FinanceAuditReport } from '../../domain/finance-projection-audit';
import type { PurchaseV2 } from '../../domain/purchase-v2-types';
import type { WorkService } from '../../domain/works-types';
import { buildUnifiedFinancePayments, type UnifiedFinancePaymentRow } from '../../domain/finance-payments';
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
  unscheduledSqlStatus: SqlParityStatus;
  unscheduledSqlChecked: number;
  unscheduledSqlExcludedPurchases: number;
  unscheduledSqlDetail: string;
  storeCostSqlStatus: SqlParityStatus;
  storeCostSqlChecked: number;
  storeCostSqlExcludedPurchases: number;
  storeCostSqlDetail: string;
  combinedSqlStatus: SqlParityStatus;
  combinedSqlChecked: number;
  combinedSqlExcludedPayments: number;
  combinedSqlDetail: string;
  originSqlStatus: SqlParityStatus;
  originSqlCheckedEvents: number;
  originSqlExcludedPurchases: number;
  originSqlDetail: string;
  storePaymentSqlStatus: SqlParityStatus;
  storePaymentSqlCheckedEvents: number;
  storePaymentSqlExcludedPurchases: number;
  storePaymentSqlDetail: string;
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

async function checkUnscheduledParity(
  purchases: PurchaseV2[],
  rows?: UnifiedFinancePaymentRow[],
): Promise<{
  unscheduledSqlStatus: SqlParityStatus;
  unscheduledSqlChecked: number;
  unscheduledSqlExcludedPurchases: number;
  unscheduledSqlDetail: string;
}> {
  const first = await listFinancePurchaseUnscheduledPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  const base = { unscheduledSqlExcludedPurchases: first.unsupportedPurchaseCount };
  if (!first.isComplete) return {
    ...base,
    unscheduledSqlStatus: 'incomplete',
    unscheduledSqlChecked: 0,
    unscheduledSqlDetail: first.unsupportedPurchaseCount +
      ' compra(s) com ajustes ou pedidos sem valor completo foram excluídas do SQL.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    ...base,
    unscheduledSqlStatus: 'incomplete',
    unscheduledSqlChecked: 0,
    unscheduledSqlDetail: 'Saldos sem programação acima do limite de conferência.',
  };

  const projected: FinancePurchaseUnscheduledRow[] = [...first.rows];
  let mismatch: string | null = null;
  const sameTotals = (next: FinancePurchaseUnscheduledPage) =>
    next.totalCount === first.totalCount &&
    next.unscheduledCents === first.unscheduledCents &&
    next.unsupportedPurchaseCount === first.unsupportedPurchaseCount &&
    next.isComplete === first.isComplete;

  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchaseUnscheduledPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      mismatch = 'A consulta SQL de saldos mudou durante a paginação.';
      break;
    }
    projected.push(...next.rows);
  }
  if (!mismatch) {
    try {
      assertPurchaseUnscheduledParity(purchases, first, projected, rows);
    } catch (error) {
      mismatch = error instanceof Error ? error.message : 'Saldos SQL divergentes.';
    }
  }
  return {
    ...base,
    unscheduledSqlStatus: mismatch ? 'failed' : 'matched',
    unscheduledSqlChecked: projected.length,
    unscheduledSqlDetail: mismatch || projected.length +
      ' saldo(s) sem programação conciliados com o cálculo atual.',
  };
}

async function checkStoreCostParity(
  purchases: PurchaseV2[],
): Promise<{
  storeCostSqlStatus: SqlParityStatus;
  storeCostSqlChecked: number;
  storeCostSqlExcludedPurchases: number;
  storeCostSqlDetail: string;
}> {
  const first = await listFinancePurchaseStoreCostsPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  const base = { storeCostSqlExcludedPurchases: first.unsupportedPurchaseCount };
  if (!first.isComplete) return {
    ...base,
    storeCostSqlStatus: 'incomplete',
    storeCostSqlChecked: 0,
    storeCostSqlDetail: first.unsupportedPurchaseCount +
      ' compra(s) excluída(s) por ajustes, linhas sem valor ou rateio duplicado.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    ...base,
    storeCostSqlStatus: 'incomplete',
    storeCostSqlChecked: 0,
    storeCostSqlDetail: 'Quantidade de pedidos supera o limite de auditoria.',
  };
  const rows: FinancePurchaseOrderCostRow[] = [...first.rows];
  let problem: string | null = null;
  const sameTotals = (next: FinancePurchaseOrderCostPage) =>
    next.totalCount === first.totalCount &&
    next.totalContractedCents === first.totalContractedCents &&
    next.totalAllocatedCents === first.totalAllocatedCents &&
    next.unsupportedPurchaseCount === first.unsupportedPurchaseCount &&
    next.isComplete === first.isComplete;

  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchaseStoreCostsPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      problem = 'A paginação SQL dos custos por loja mudou durante a leitura.';
      break;
    }
    rows.push(...next.rows);
  }

  if (!problem) {
    try {
      assertPurchaseStoreCostParity(purchases, first, rows);
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Rateios por loja divergentes.';
    }
  }
  return {
    ...base,
    storeCostSqlStatus: problem ? 'failed' : 'matched',
    storeCostSqlChecked: rows.length,
    storeCostSqlDetail: problem || rows.length +
      ' pedido(s) com custo por loja conciliado(s) em centavos.',
  };
}

async function checkCombinedParity(
  currentRows: UnifiedFinancePaymentRow[],
): Promise<{
  combinedSqlStatus: SqlParityStatus;
  combinedSqlChecked: number;
  combinedSqlExcludedPayments: number;
  combinedSqlDetail: string;
}> {
  const first = await listFinancePurchaseCombinedGroupsPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  const base = { combinedSqlExcludedPayments: first.unsupportedPaymentCount };
  if (!first.isComplete) return {
    ...base,
    combinedSqlStatus: 'incomplete',
    combinedSqlChecked: 0,
    combinedSqlDetail: first.unsupportedPaymentCount +
      ' pagamento(s) de compras combinadas possuem ajustes ou parcelamento não suportado.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    ...base,
    combinedSqlStatus: 'incomplete',
    combinedSqlChecked: 0,
    combinedSqlDetail: 'Quantidade de grupos excede o limite de segurança.',
  };
  const rows: FinancePurchaseCombinedGroup[] = [...first.rows];
  let mismatch: string | null = null;
  const sameTotals = (next: FinancePurchaseCombinedPage) =>
    next.totalCount === first.totalCount &&
    next.amountCentsTotal === first.amountCentsTotal &&
    next.unsupportedPaymentCount === first.unsupportedPaymentCount &&
    next.isComplete === first.isComplete;
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchaseCombinedGroupsPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      mismatch = 'A paginação de grupos entre CMPs mudou durante a consulta.';
      break;
    }
    rows.push(...next.rows);
  }
  if (!mismatch) {
    try {
      assertCombinedPurchaseParity(currentRows, first, rows);
    } catch (error) {
      mismatch = error instanceof Error ? error.message : 'Grupos combinados divergentes.';
    }
  }
  return {
    ...base,
    combinedSqlStatus: mismatch ? 'failed' : 'matched',
    combinedSqlChecked: rows.length,
    combinedSqlDetail: mismatch ||
      (rows.length ? rows.length + ' grupo(s) combinado(s) reconciliado(s).' :
        'Nenhuma CMP combinada no DEV; verificação real de agrupamento ainda pendente.'),
  };
}

async function checkPaymentOriginParity(
  canonicalRows: UnifiedFinancePaymentRow[],
): Promise<{
  originSqlStatus: SqlParityStatus;
  originSqlCheckedEvents: number;
  originSqlExcludedPurchases: number;
  originSqlDetail: string;
}> {
  const first = await listFinancePurchasePaymentOriginsPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  const base = { originSqlExcludedPurchases: first.unsupportedPurchaseCount };
  if (!first.isComplete) return {
    ...base,
    originSqlStatus: 'incomplete',
    originSqlCheckedEvents: 0,
    originSqlDetail: first.unsupportedPurchaseCount +
      ' compra(s) com ajustes, custo desconhecido ou eventos incompatíveis.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    ...base,
    originSqlStatus: 'incomplete',
    originSqlCheckedEvents: 0,
    originSqlDetail: 'Quantidade de eventos por origem excede limite da auditoria.',
  };
  const events: FinancePurchaseOriginEvent[] = [...first.rows];
  let problem: string | null = null;
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePurchasePaymentOriginsPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (next.totalCount !== first.totalCount ||
        next.unsupportedPurchaseCount !== first.unsupportedPurchaseCount ||
        !next.isComplete ||
        next.page !== page || next.pageSize !== PAGE_SIZE) {
      problem = 'Consulta de origens por pagamento variou durante a paginação.';
      break;
    }
    events.push(...next.rows);
  }
  if (!problem) {
    try {
      assertPurchasePaymentOriginParity(canonicalRows, first, events);
    } catch (error) {
      problem = error instanceof Error ? error.message :
        'Origem do pagamento não conciliada.';
    }
  }
  return {
    ...base,
    originSqlStatus: problem ? 'failed' : 'matched',
    originSqlCheckedEvents: events.length,
    originSqlDetail: problem || events.length +
      ' evento(s) classificados por origem financeira e conciliados.',
  };
}

async function checkStorePaymentParity(
  canonicalRows: UnifiedFinancePaymentRow[],
): Promise<{
  storePaymentSqlStatus: SqlParityStatus;
  storePaymentSqlCheckedEvents: number;
  storePaymentSqlExcludedPurchases: number;
  storePaymentSqlDetail: string;
}> {
  const first = await listFinancePaymentStoreOriginsPage({
    page: 1, pageSize: PAGE_SIZE, allowIncomplete: true,
  });
  const base = { storePaymentSqlExcludedPurchases: first.unsupportedPurchaseCount };
  if (!first.isComplete) return {
    ...base,
    storePaymentSqlStatus: 'incomplete',
    storePaymentSqlCheckedEvents: 0,
    storePaymentSqlDetail: 'Consulta de pagamentos por loja/origem possui compras ou parcelas excluídas.',
  };
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  if (pages > MAX_PAGES) return {
    ...base,
    storePaymentSqlStatus: 'incomplete',
    storePaymentSqlCheckedEvents: 0,
    storePaymentSqlDetail: 'Quantidade de eventos de loja excede limite de auditoria.',
  };
  const events: FinancePaymentStoreOriginSqlEvent[] = [...first.rows];
  let problem: string | null = null;
  const sameTotals = (next: FinancePaymentStoreOriginSqlPage) =>
    next.totalCount === first.totalCount &&
    next.unsupportedPurchaseCount === first.unsupportedPurchaseCount &&
    next.unsupportedPaymentCount === first.unsupportedPaymentCount &&
    next.isComplete === first.isComplete;
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFinancePaymentStoreOriginsPage({
      page, pageSize: PAGE_SIZE, allowIncomplete: true,
    });
    if (!sameTotals(next) || next.page !== page || next.pageSize !== PAGE_SIZE) {
      problem = 'Paginação do rateio financeiro por loja/origem variou durante a conferência.';
      break;
    }
    events.push(...next.rows);
  }
  if (!problem) {
    try {
      assertFinancePaymentStoreParity(canonicalRows, first, events);
    } catch (error) {
      problem = error instanceof Error ? error.message :
        'Divergência no pagamento distribuído entre lojas.';
    }
  }
  return {
    ...base,
    storePaymentSqlStatus: problem ? 'failed' : 'matched',
    storePaymentSqlCheckedEvents: events.length,
    storePaymentSqlDetail: problem ||
      events.length+' evento(s) conciliados por loja/origem e valor não alocado.',
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
  const [first, adjustmentSql, unscheduledSql, storeCostSql, combinedSql, originSql, storePaymentSql] = await Promise.all([
    listFinancePurchaseEventsPage({ page: 1, pageSize: PAGE_SIZE, allowIncomplete: true }),
    checkAdjustmentParity(purchases),
    checkUnscheduledParity(purchases, displayedRows),
    checkStoreCostParity(purchases),
    checkCombinedParity(displayedRows || buildUnifiedFinancePayments(purchases, works)),
    checkPaymentOriginParity(displayedRows || buildUnifiedFinancePayments(purchases, works)),
    checkStorePaymentParity(displayedRows || buildUnifiedFinancePayments(purchases, works)),
  ]);

  const base = {
    domain,
    excludedPurchases: first.unsupportedPurchaseCount,
    excludedPayments: first.unsupportedPaymentCount,
    ...adjustmentSql,
    ...unscheduledSql,
    ...storeCostSql,
    ...combinedSql,
    ...originSql,
    ...storePaymentSql,
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
      adjustmentSql.adjustmentSqlStatus === 'matched' &&
      unscheduledSql.unscheduledSqlStatus === 'matched' &&
      storeCostSql.storeCostSqlStatus === 'matched' &&
      combinedSql.combinedSqlStatus === 'matched' &&
      originSql.originSqlStatus === 'matched' &&
      storePaymentSql.storePaymentSqlStatus === 'matched',
  };
}
