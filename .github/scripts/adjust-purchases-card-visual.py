from pathlib import Path

branch_page = Path('src/pages/supply-purchases-page.tsx')
text = branch_page.read_text(encoding='utf-8')

store_helper_anchor = """function purchaseStoresLabel(purchase: PurchaseV2): string {
  if (purchase.stores.length === 1) return purchase.stores[0].code;
  return `${purchase.stores.length} lojas`;
}
"""
store_helper = store_helper_anchor + """function singleStoreHeading(purchase: PurchaseV2): string {
  if (purchase.stores.length !== 1) return purchaseStoresLabel(purchase);
  const store = purchase.stores[0];
  const city = store.city.trim().toLocaleUpperCase('pt-BR');
  const cityWithProtectedTail = city.replace(/\\s+(\\S+)$/, '\\u00A0$1');
  return `${store.code} ${cityWithProtectedTail}\\u00A0-\\u00A0${store.state}`;
}
"""
if store_helper_anchor not in text:
    raise SystemExit('purchaseStoresLabel anchor not found')
text = text.replace(store_helper_anchor, store_helper, 1)

old_calc = """const operationSummaries=active.map((order)=>({financial:purchaseOrderFinancialSummary(purchase,order),costs:purchaseOrderStoreCosts(order)}));const linkedPaid=operationSummaries.reduce((sum,entry)=>sum+entry.financial.paidCents,0n);const incompleteOperations="""
new_calc = """const operationSummaries=active.map((order)=>({financial:purchaseOrderFinancialSummary(purchase,order),costs:purchaseOrderStoreCosts(order)}));const totalPaid=purchase.payments.filter((payment)=>payment.status==='paid').reduce((sum,payment)=>sum+moneyToCents(payment.amount),0n);const shippingCents=active.flatMap((order)=>order.lines).reduce((sum,line)=>sum+(line.shippingAmount===null?0n:moneyToCents(line.shippingAmount)),0n);const itemsWithoutFreightCents=summary.realizedCents-shippingCents;const incompleteOperations="""
if old_calc not in text:
    raise SystemExit('header calculation anchor not found')
text = text.replace(old_calc, new_calc, 1)

old_store = """<strong>{purchase.stores.length===1?`${purchase.stores[0].code} ${purchase.stores[0].city.toLocaleUpperCase('pt-BR')} - ${purchase.stores[0].state}`:purchaseStoresLabel(purchase)}</strong>"""
new_store = """<strong className=\"purchase-v2-store-heading\">{purchase.stores.length===1?singleStoreHeading(purchase):purchaseStoresLabel(purchase)}</strong>"""
if old_store not in text:
    raise SystemExit('single store headline anchor not found')
text = text.replace(old_store, new_store, 1)

old_amount = """<div><strong>{formatBRL(summary.approvedCents)}</strong><small>Comprado {formatBRL(summary.realizedCents)} · pago vinculado {formatBRL(linkedPaid)} · saldo para comprar {formatBRL(summary.balanceCents)}</small></div>"""
new_amount = """<div className=\"purchase-v2-card__amount\"><strong>{formatBRL(totalPaid)}</strong><small className=\"purchase-v2-card__amount-label\">Total pago</small><small>Itens sem frete {formatBRL(itemsWithoutFreightCents)} · frete {formatBRL(shippingCents)}</small><small>Comprado {formatBRL(summary.realizedCents)} · saldo para comprar {formatBRL(summary.balanceCents)}</small></div>"""
if old_amount not in text:
    raise SystemExit('purchase amount anchor not found')
text = text.replace(old_amount, new_amount, 1)
branch_page.write_text(text, encoding='utf-8')

css_path = Path('src/pages/supply-purchases-v2.css')
css = css_path.read_text(encoding='utf-8')
old_realized = """.purchase-v2-card.is-realized {
  border-color: #b9d8c4;
  box-shadow: inset 4px 0 0 #238451;
}
"""
new_realized = """.purchase-v2-card.is-realized {
  border-color: #9fd7b3;
  box-shadow: inset 6px 0 0 #16a34a;
}
"""
if old_realized not in css:
    raise SystemExit('realized card style anchor not found')
css = css.replace(old_realized, new_realized, 1)
css = css.replace('.purchase-v2-card--purchased { border-left-color: #23835f; }', '.purchase-v2-card--purchased { border-left-color: #16a34a; }', 1)
old_grid = '  grid-template-columns: minmax(90px,.6fr) minmax(180px,1.3fr) minmax(135px,.8fr) minmax(200px,1fr) auto auto;'
new_grid = '  grid-template-columns: minmax(90px,.6fr) minmax(180px,1.2fr) minmax(185px,.95fr) minmax(220px,1.1fr) auto auto;'
if old_grid not in css:
    raise SystemExit('purchase header grid anchor not found')
css = css.replace(old_grid, new_grid, 1)
style_anchor = '.purchase-v2-card__header small { color: var(--muted); font-size: .72rem; }\n'
extra_styles = style_anchor + """.purchase-v2-store-heading { line-height: 1.2; word-break: normal; overflow-wrap: normal; }
.purchase-v2-card__amount { align-content: start; }
.purchase-v2-card__amount > strong { font-size: 1.02rem; line-height: 1.1; }
.purchase-v2-card__amount-label { color: #247447 !important; font-size: .61rem !important; font-weight: 900; letter-spacing: .045em; text-transform: uppercase; }
.purchase-v2-card__amount small:not(.purchase-v2-card__amount-label) { line-height: 1.25; }
"""
if style_anchor not in css:
    raise SystemExit('header small style anchor not found')
css = css.replace(style_anchor, extra_styles, 1)
css_path.write_text(css, encoding='utf-8')

test_path = Path('src/tests/supply-purchases-page.test.tsx')
test_text = test_path.read_text(encoding='utf-8')
test_anchor = "  it('mantem a compra recolhida compacta e mostra os itens sob demanda', async () => {\n"
new_test = """  it('exibe total pago e separa itens sem frete no cabecalho', async () => {
    renderPage({
      ...purchase,
      status: 'purchased',
      stores: [{ ...purchase.stores[0], city: 'Santa Maria de Itabira', state: 'MG' }],
      orders: [{
        ...purchase.orders[0],
        lines: [{
          ...partialLine,
          shippingType: 'informed',
          actualShippingType: 'informed',
          shippingAmount: '25',
          lineTotal: '425',
        }],
      }],
      payments: [{ ...purchase.payments[0], amount: '425' }],
    });

    await screen.findByText('CMP-00001');
    const card = screen.getByText('CMP-00001').closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Total pago')).toBeInTheDocument();
    expect(within(card!).getAllByText('R$ 425,00').length).toBeGreaterThan(0);
    expect(within(card!).getByText('Itens sem frete R$ 400,00 · frete R$ 25,00')).toBeInTheDocument();
    expect(within(card!).getByText(/SANTA MARIA DE ITABIRA/)).toBeInTheDocument();
  });

"""
if test_anchor not in test_text:
    raise SystemExit('compact purchase test anchor not found')
test_text = test_text.replace(test_anchor, new_test + test_anchor, 1)
test_path.write_text(test_text, encoding='utf-8')
