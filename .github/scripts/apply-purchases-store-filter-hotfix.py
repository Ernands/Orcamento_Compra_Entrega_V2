from pathlib import Path

path = Path('src/pages/supply-purchases-page.tsx')
text = path.read_text(encoding='utf-8')

old_options = "  const destinationLabels = useMemo(() => [...new Set(purchases.flatMap((purchase)=>purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.label))))].sort((a,b)=>a.localeCompare(b,'pt-BR')), [purchases]);"
new_options = """  const destinationLabels = useMemo(() => [...new Set(purchases.flatMap((purchase)=>[
    ...purchase.stores.map((store)=>`${store.code} - ${store.name}`),
    ...purchase.items.flatMap((item)=>item.destinations.map((destination)=>destination.label)),
  ]))].sort((a,b)=>a.localeCompare(b,'pt-BR')), [purchases]);"""
if old_options not in text:
    raise SystemExit('destinationLabels anchor not found')
text = text.replace(old_options, new_options, 1)

old_filter = "      if (destinationFilter && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.label===destinationFilter))) return false;"
new_filter = """      if (destinationFilter
        && !purchase.items.some((item)=>item.destinations.some((destination)=>destination.label===destinationFilter))
        && !purchase.stores.some((store)=>destinationFilter===store.code || destinationFilter===`${store.code} - ${store.name}`)
        && !purchase.items.some((item)=>item.storeCode===destinationFilter)
      ) return false;"""
if old_filter not in text:
    raise SystemExit('destinationFilter anchor not found')
text = text.replace(old_filter, new_filter, 1)

old_select = '<select aria-label="Prospector ou destino" value={destinationFilter} onChange={(event)=>setDestinationFilter(event.target.value)}><option value="">Todos os destinos</option>'
new_select = '<select aria-label="Loja, prospector ou destino" value={destinationFilter} onChange={(event)=>setDestinationFilter(event.target.value)}><option value="">Todas as lojas/destinos</option>'
if old_select not in text:
    raise SystemExit('destination select anchor not found')
text = text.replace(old_select, new_select, 1)

path.write_text(text, encoding='utf-8')
