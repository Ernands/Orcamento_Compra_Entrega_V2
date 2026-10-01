from pathlib import Path

path = Path('src/pages/supply-purchases-page.tsx')
text = path.read_text(encoding='utf-8')

state_anchor = "  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());\n"
state_insert = state_anchor + "  const [compactItemIds, setCompactItemIds] = useState<Set<string>>(new Set());\n  const [compactAllItemIds, setCompactAllItemIds] = useState<Set<string>>(new Set());\n"
if state_anchor not in text:
    raise SystemExit('expandedIds state anchor not found')
text = text.replace(state_anchor, state_insert, 1)

function_anchor = """  const togglePurchaseDetails = (purchaseId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  };

"""
function_insert = function_anchor + """  const toggleCompactItems = (purchaseId: string) => {
    setCompactItemIds((current) => {
      const next = new Set(current);
      if (next.has(purchaseId)) {
        next.delete(purchaseId);
        setCompactAllItemIds((allCurrent) => {
          const allNext = new Set(allCurrent);
          allNext.delete(purchaseId);
          return allNext;
        });
      } else {
        next.add(purchaseId);
      }
      return next;
    });
  };

  const toggleCompactAllItems = (purchaseId: string) => {
    setCompactAllItemIds((current) => {
      const next = new Set(current);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  };

"""
if function_anchor not in text:
    raise SystemExit('togglePurchaseDetails anchor not found')
text = text.replace(function_anchor, function_insert, 1)

map_anchor = "const expanded=expandedIds.has(purchase.id);const operationSummaries="
map_insert = "const expanded=expandedIds.has(purchase.id);const compactItemsVisible=compactItemIds.has(purchase.id);const compactAllItems=compactAllItemIds.has(purchase.id);const compactItems=compactAllItems?purchase.items:purchase.items.slice(0,4);const approvedUnits=purchase.items.reduce((sum,item)=>sum+quantityToThousandths(item.quantityApproved),0n);const operationSummaries="
if map_anchor not in text:
    raise SystemExit('purchase map anchor not found')
text = text.replace(map_anchor, map_insert, 1)

old_store = "<div title={purchase.stores.map((store)=>`${store.code} - ${store.city}/${store.state}${store.address?` - ${store.address}`:''}`).join('\\n')}><strong>{purchaseStoresLabel(purchase)}</strong><small>{purchase.stores.length===1?`${purchase.stores[0].city}/${purchase.stores[0].state}`:'Passe para ver as lojas'}</small></div>"
new_store = "<div title={purchase.stores.map((store)=>`${store.code} - ${store.city}/${store.state}${store.address?` - ${store.address}`:''}`).join('\\n')}><strong>{purchase.stores.length===1?`${purchase.stores[0].code} ${purchase.stores[0].city.toLocaleUpperCase('pt-BR')} - ${purchase.stores[0].state}`:purchaseStoresLabel(purchase)}</strong>{purchase.stores.length>1&&<small>Passe para ver as lojas</small>}</div>"
if old_store not in text:
    raise SystemExit('single store header anchor not found')
text = text.replace(old_store, new_store, 1)

start_anchor = "      {!expanded && <div className=\"purchase-v2-card__collapsed-items\" aria-label={`Itens da compra ${purchase.code}`}>"
end_anchor = "      {expanded && <><div className=\"purchase-v2-indicators\">"
start = text.find(start_anchor)
if start < 0:
    raise SystemExit('collapsed block start not found')
end = text.find(end_anchor, start)
if end < 0:
    raise SystemExit('collapsed block end not found')

collapsed = """      {!expanded && <div className=\"purchase-v2-card__collapsed-items\" aria-label={`Resumo dos itens da compra ${purchase.code}`}>
        <div className=\"purchase-v2-bulk-actions\">
          <span><strong>{purchase.items.length} itens · {formatQuantityV2(decimalFromThousandths(approvedUnits))} un</strong></span>
          <button type=\"button\" className=\"button button--secondary button--small\" onClick={()=>toggleCompactItems(purchase.id)}>{compactItemsVisible ? 'Ocultar itens' : `Ver itens (${purchase.items.length})`}</button>
        </div>
        {compactItemsVisible && <>
          {compactItems.map((item)=>{const execution=itemExecution(item,purchase);return <div key={item.id} className=\"purchase-v2-card__collapsed-item\"><span><strong>{item.itemName}</strong><small>{item.itemCode}{item.offeredBrandModel?` · ${item.offeredBrandModel}`:''}</small></span><span className=\"purchase-v2-card__collapsed-quantities\"><small>Aprovado <strong>{formatQuantityV2(item.quantityApproved)} {item.unit}</strong></small><small>Comprado <strong>{formatQuantityV2(decimalFromThousandths(execution.purchasedQuantity))} {item.unit}</strong></small><small>Falta <strong>{formatQuantityV2(decimalFromThousandths(execution.missingQuantity))} {item.unit}</strong></small></span>{item.productUrl&&<a href={item.productUrl} target=\"_blank\" rel=\"noreferrer\">Ver produto</a>}</div>})}
          {purchase.items.length>4&&<div className=\"purchase-v2-bulk-actions\"><span>{compactAllItems ? `${purchase.items.length} itens exibidos` : `+ ${purchase.items.length-4} outros itens`}</span><button type=\"button\" className=\"button button--secondary button--small\" onClick={()=>toggleCompactAllItems(purchase.id)}>{compactAllItems ? 'Mostrar menos' : `Mostrar todos (${purchase.items.length})`}</button></div>}
        </>}
      </div>}
"""
text = text[:start] + collapsed + text[end:]

path.write_text(text, encoding='utf-8')
