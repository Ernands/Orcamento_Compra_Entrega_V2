from pathlib import Path

branch = 'feature/purchases-paid-total-visual'

# Finance payments page: make KPI/origin summary follow active filters, while tabs only select status.
payments_path = Path('src/pages/finance-payments-page.tsx')
text = payments_path.read_text(encoding='utf-8')
start_anchor = "  const rows = useMemo(() => buildUnifiedFinancePayments(purchases, works), [purchases, works]);"
end_anchor = "\n\n  const hasDeepFilter = Boolean(focusItemId || focusServiceId);"
start = text.index(start_anchor)
end = text.index(end_anchor, start)
new_block = """  const rows = useMemo(() => buildUnifiedFinancePayments(purchases, works), [purchases, works]);
  const states = useMemo(() => [...new Set(stores.map((store) => store.state))].sort(), [stores]);
  const suppliers = useMemo(
    () => [...new Set(rows.map((row) => row.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  );
  const methods = useMemo(
    () => [...new Set(rows.map((row) => row.paymentMethod).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );

  const summaryRows = useMemo(() => {
    const search = normalized(query);
    return rows
      .filter(
        (row) =>
          !originFilter ||
          row.originAllocations[originFilter as FinancePaymentOrigin] > 0n,
      )
      .filter((row) => !storeFilter || row.storeIds.includes(storeFilter))
      .filter((row) => !stateFilter || row.states.includes(stateFilter))
      .filter((row) => !supplierFilter || row.supplierName === supplierFilter)
      .filter((row) => !methodFilter || row.paymentMethod === methodFilter)
      .filter((row) => !focusItemId || row.supplyItemIds.includes(focusItemId))
      .filter((row) => !focusServiceId || row.workServiceId === focusServiceId)
      .filter((row) => !dateFrom || (row.date !== null && row.date >= dateFrom))
      .filter((row) => !dateTo || (row.date !== null && row.date <= dateTo))
      .filter(
        (row) =>
          !search ||
          normalized(
            [
              ...row.referenceCodes,
              row.supplierName,
              row.description,
              row.sourceLabel || '',
              row.installmentLabel,
              ...row.storeCodes,
              ...row.states,
            ].join(' '),
          ).includes(search),
      );
  }, [
    dateFrom,
    dateTo,
    focusItemId,
    focusServiceId,
    methodFilter,
    originFilter,
    query,
    rows,
    stateFilter,
    storeFilter,
    supplierFilter,
  ]);

  const totals = useMemo(() => financePaymentTotals(summaryRows), [summaryRows]);
  const originSummary = useMemo(() => financePaymentOriginSummary(summaryRows), [summaryRows]);
  const filteredRows = useMemo(
    () =>
      summaryRows
        .filter((row) => row.status === view)
        .sort((a, b) => dateSort(a, b, view)),
    [summaryRows, view],
  );
  const activeFilterCount = [
    originFilter,
    storeFilter,
    stateFilter,
    supplierFilter,
    methodFilter,
    dateFrom,
    dateTo,
    query.trim(),
    focusItemId,
    focusServiceId,
  ].filter(Boolean).length;"""
text = text[:start] + new_block + text[end:]

heading_anchor = "          <p>Visão consolidada dos pagamentos realizados e dos compromissos a realizar.</p>\n"
heading_replacement = heading_anchor + """          {activeFilterCount > 0 && (
            <span className=\"finance-payments-filter-indicator\" role=\"status\">
              {activeFilterCount === 1 ? '1 filtro ativo' : `${activeFilterCount} filtros ativos`}
            </span>
          )}
"""
if heading_anchor not in text:
    raise SystemExit('payments heading anchor not found')
text = text.replace(heading_anchor, heading_replacement, 1)

origin_subtitle = "                <span>Equipamentos, mobiliário, itens gerais e obras e serviços.</span>\n"
origin_replacement = """                <span>
                  {activeFilterCount > 0
                    ? 'Valores considerando os filtros ativos.'
                    : 'Equipamentos, mobiliário, itens gerais e obras e serviços.'}
                </span>
"""
if origin_subtitle not in text:
    raise SystemExit('origin subtitle anchor not found')
text = text.replace(origin_subtitle, origin_replacement, 1)
payments_path.write_text(text, encoding='utf-8')

# Finance payments CSS: top filter marker.
payments_css_path = Path('src/pages/finance-payments-page.css')
css = payments_css_path.read_text(encoding='utf-8')
heading_css_anchor = """.finance-payments-heading {
  align-items: center;
}
"""
heading_css_replacement = heading_css_anchor + """
.finance-payments-filter-indicator {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  margin-top: 8px;
  padding: 4px 9px;
  color: #2947ba;
  background: #eef3ff;
  border: 1px solid #c5d2f7;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 850;
}
"""
if heading_css_anchor not in css:
    raise SystemExit('payments heading css anchor not found')
css = css.replace(heading_css_anchor, heading_css_replacement, 1)
payments_css_path.write_text(css, encoding='utf-8')

# Store detail: disable payment action when there is no matching finance row.
store_path = Path('src/pages/finance-store-detail-page.tsx')
store_text = store_path.read_text(encoding='utf-8')
payment_view_anchor = """  const paymentViewFor = (
    predicate: (row: (typeof paymentRows)[number]) => boolean,
  ): FinancePaymentsView => {
"""
payment_view_replacement = """  const hasPaymentRowsFor = (
    predicate: (row: (typeof paymentRows)[number]) => boolean,
  ) =>
    paymentRows.some(
      (row) => (!storeId || row.storeIds.includes(storeId)) && predicate(row),
    );

""" + payment_view_anchor
if payment_view_anchor not in store_text:
    raise SystemExit('payment view anchor not found')
store_text = store_text.replace(payment_view_anchor, payment_view_replacement, 1)

item_link_old = """                    {canPayments && (
                      <td>
                        <Link
                          className=\"finance-store-detail__payment-link\"
                          to={itemPaymentsHref(row)}
                          title=\"Abrir os pagamentos relacionados a este item\"
                        >
                          <WalletCards size={14} />
                          Ver pagamentos
                        </Link>
                      </td>
                    )}
"""
item_link_new = """                    {canPayments && (
                      <td>
                        {hasPaymentRowsFor((payment) => payment.supplyItemIds.includes(row.supplyItemId)) ? (
                          <Link
                            className=\"finance-store-detail__payment-link\"
                            to={itemPaymentsHref(row)}
                            title=\"Abrir os pagamentos relacionados a este item\"
                          >
                            <WalletCards size={14} />
                            Ver pagamentos
                          </Link>
                        ) : (
                          <button
                            type=\"button\"
                            className=\"finance-store-detail__payment-link is-disabled\"
                            disabled
                            title=\"Nenhum pagamento relacionado a este item\"
                          >
                            <WalletCards size={14} />
                            Ver pagamentos
                          </button>
                        )}
                      </td>
                    )}
"""
if item_link_old not in store_text:
    raise SystemExit('item payment link anchor not found')
store_text = store_text.replace(item_link_old, item_link_new, 1)

work_link_old = """                      {canPayments && (
                        <td>
                          <Link
                            className=\"finance-store-detail__payment-link\"
                            to={workPaymentsHref(work)}
                            title=\"Abrir os pagamentos relacionados a este serviço\"
                          >
                            <WalletCards size={14} />
                            Ver pagamentos
                          </Link>
                        </td>
                      )}
"""
work_link_new = """                      {canPayments && (
                        <td>
                          {hasPaymentRowsFor((payment) => payment.workServiceId === work.id) ? (
                            <Link
                              className=\"finance-store-detail__payment-link\"
                              to={workPaymentsHref(work)}
                              title=\"Abrir os pagamentos relacionados a este serviço\"
                            >
                              <WalletCards size={14} />
                              Ver pagamentos
                            </Link>
                          ) : (
                            <button
                              type=\"button\"
                              className=\"finance-store-detail__payment-link is-disabled\"
                              disabled
                              title=\"Nenhum pagamento relacionado a este serviço\"
                            >
                              <WalletCards size={14} />
                              Ver pagamentos
                            </button>
                          )}
                        </td>
                      )}
"""
if work_link_old not in store_text:
    raise SystemExit('work payment link anchor not found')
store_text = store_text.replace(work_link_old, work_link_new, 1)
store_path.write_text(store_text, encoding='utf-8')

# Store detail CSS: disabled payment action.
store_css_path = Path('src/pages/finance-store-detail-page.css')
store_css = store_css_path.read_text(encoding='utf-8')
payment_hover_anchor = """.finance-store-detail__payment-link:hover {
  color: var(--brand-dark);
  background: #e2eaff;
  border-color: #aebfe9;
}
"""
payment_hover_replacement = payment_hover_anchor + """
.finance-store-detail__payment-link.is-disabled,
.finance-store-detail__payment-link:disabled {
  color: #87918d;
  background: #f2f4f3;
  border-color: #d8ddda;
  cursor: not-allowed;
  opacity: 0.72;
  pointer-events: none;
}
"""
if payment_hover_anchor not in store_css:
    raise SystemExit('payment hover css anchor not found')
store_css = store_css.replace(payment_hover_anchor, payment_hover_replacement, 1)
store_css_path.write_text(store_css, encoding='utf-8')

# Raw-source tests keep these UX rules covered without introducing repository mocks.
filter_test_path = Path('src/tests/finance-payments-filtered-summary.test.ts')
filter_test_path.write_text("""import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';
import styles from '../pages/finance-payments-page.css?raw';

describe('finance payments filtered summary', () => {
  it('recalcula os indicadores e origem com o mesmo escopo dos filtros', () => {
    expect(page).toContain('const summaryRows = useMemo');
    expect(page).toContain('financePaymentTotals(summaryRows)');
    expect(page).toContain('financePaymentOriginSummary(summaryRows)');
    expect(page).toContain('.filter((row) => row.status === view)');
  });

  it('indica no topo quando existem filtros ativos', () => {
    expect(page).toContain('finance-payments-filter-indicator');
    expect(page).toContain('filtros ativos');
    expect(styles).toContain('.finance-payments-filter-indicator');
  });
});
""", encoding='utf-8')

heading_test_path = Path('src/tests/finance-store-detail-heading.test.ts')
heading_test = heading_test_path.read_text(encoding='utf-8')
insert_anchor = "\n});\n"
new_test = """

  it('desabilita Ver pagamentos quando nao ha linha financeira relacionada', () => {
    expect(page).toContain('const hasPaymentRowsFor');
    expect(page).toContain('finance-store-detail__payment-link is-disabled');
    expect(page).toContain('Nenhum pagamento relacionado a este item');
    expect(page).toContain('Nenhum pagamento relacionado a este serviço');
    expect(styles).toContain('.finance-store-detail__payment-link:disabled');
  });
"""
if not heading_test.endswith(insert_anchor):
    raise SystemExit('store heading test closing anchor not found')
heading_test = heading_test[:-len(insert_anchor)] + new_test + insert_anchor
heading_test_path.write_text(heading_test, encoding='utf-8')
