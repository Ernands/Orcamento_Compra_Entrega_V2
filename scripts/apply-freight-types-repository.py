from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:100]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# Domain types
path = 'src/domain/types.ts'
replace_once(
    path,
    "export type SupplyShippingType = 'free' | 'informed' | 'pending';\n",
    "export type SupplyShippingType = 'free' | 'informed' | 'pending';\n"
    "export type SupplyFreightDestinationType = 'profile' | 'store';\n"
    "export type SupplyComparisonMode = 'item' | 'quote';\n",
)

replace_once(
    path,
    'export interface SupplyQuoteItemValues {\n',
    "export interface SupplyFreightProfile {\n"
    "  id: string;\n"
    "  name: string;\n"
    "  state: string;\n"
    "  active: boolean;\n"
    "  position: number;\n"
    "  storeIds: string[];\n"
    "}\n\n"
    "export interface SupplyQuoteItemDestinationValues {\n"
    "  key: string;\n"
    "  destinationType: SupplyFreightDestinationType;\n"
    "  profileId: string;\n"
    "  storeId: string;\n"
    "  label: string;\n"
    "  state: string;\n"
    "  destinationCount: number;\n"
    "  quantity: string;\n"
    "  unit: string;\n"
    "  shippingType: SupplyShippingType;\n"
    "  shippingAmount: string;\n"
    "  deliveryDays: string;\n"
    "  notes: string;\n"
    "}\n\n"
    "export interface SupplyQuoteItemDestination {\n"
    "  id: string;\n"
    "  quoteItemId: string;\n"
    "  destinationType: SupplyFreightDestinationType;\n"
    "  profileId: string | null;\n"
    "  storeId: string | null;\n"
    "  label: string;\n"
    "  state: string;\n"
    "  destinationCount: number;\n"
    "  quantity: string;\n"
    "  unit: string;\n"
    "  shippingType: SupplyShippingType;\n"
    "  shippingAmount: string | null;\n"
    "  deliveryDays: number | null;\n"
    "  notes: string | null;\n"
    "  position: number;\n"
    "}\n\n"
    'export interface SupplyQuoteItemValues {\n',
)

replace_once(
    path,
    "  capturedAt: string;\n}\n\nexport interface SupplyQuoteValues",
    "  capturedAt: string;\n  destinations: SupplyQuoteItemDestinationValues[];\n}\n\nexport interface SupplyQuoteValues",
)

replace_once(
    path,
    "  capturedAt: string | null;\n}\n\nexport interface SupplyQuote {",
    "  capturedAt: string | null;\n  position: number;\n  destinations: SupplyQuoteItemDestination[];\n}\n\nexport interface SupplyQuote {",
)

# Supply repository
path = 'src/data/supplies/supplies-repository.ts'
replace_once(
    path,
    "  SupplyItemValues,\n  SupplyNeed,\n  SupplyQuote,\n  SupplyQuoteItem,\n",
    "  SupplyItemValues,\n  SupplyNeed,\n  SupplyFreightProfile,\n  SupplyQuote,\n  SupplyQuoteItem,\n  SupplyQuoteItemDestination,\n",
)

replace_once(
    path,
    "type QuoteItemRow = Database['public']['Tables']['supply_quote_items']['Row'];\n",
    "type QuoteItemRow = Database['public']['Tables']['supply_quote_items']['Row'] & { position: number };\n"
    "type FreightProfileRow = { id: string; name: string; state: string; active: boolean; position: number };\n"
    "type FreightProfileStoreRow = { profile_id: string; store_id: string };\n"
    "type QuoteDestinationRow = {\n"
    "  id: string; quote_item_id: string; destination_type: 'profile' | 'store';\n"
    "  profile_id: string | null; store_id: string | null; label_snapshot: string;\n"
    "  state_snapshot: string; destination_count: number; quantity: number | string; unit: string;\n"
    "  shipping_type: 'free' | 'informed' | 'pending'; shipping_amount: number | string | null;\n"
    "  delivery_days: number | null; notes: string | null; position: number;\n"
    "};\n",
)

replace_once(
    path,
    "function mapQuoteItem(\n  row: QuoteItemRow,\n  items: Map<string, SupplyItem>,\n  needs: Map<string, { title: string }>,\n  stores: Map<string, Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>>,\n): SupplyQuoteItem {",
    "function mapQuoteDestination(row: QuoteDestinationRow): SupplyQuoteItemDestination {\n"
    "  return {\n"
    "    id: row.id,\n"
    "    quoteItemId: row.quote_item_id,\n"
    "    destinationType: row.destination_type,\n"
    "    profileId: row.profile_id,\n"
    "    storeId: row.store_id,\n"
    "    label: row.label_snapshot,\n"
    "    state: row.state_snapshot,\n"
    "    destinationCount: row.destination_count,\n"
    "    quantity: String(row.quantity),\n"
    "    unit: row.unit,\n"
    "    shippingType: row.shipping_type,\n"
    "    shippingAmount: row.shipping_amount === null ? null : String(row.shipping_amount),\n"
    "    deliveryDays: row.delivery_days,\n"
    "    notes: row.notes,\n"
    "    position: row.position,\n"
    "  };\n"
    "}\n\n"
    "export async function listSupplyFreightProfiles(): Promise<SupplyFreightProfile[]> {\n"
    "  const [profilesResult, profileStoresResult] = await Promise.all([\n"
    "    supabase.from('supply_freight_profiles' as never).select('*').order('position'),\n"
    "    supabase.from('supply_freight_profile_stores' as never).select('*'),\n"
    "  ]);\n"
    "  if (profilesResult.error) throw profilesResult.error;\n"
    "  if (profileStoresResult.error) throw profileStoresResult.error;\n"
    "  const profiles = profilesResult.data as unknown as FreightProfileRow[];\n"
    "  const memberships = profileStoresResult.data as unknown as FreightProfileStoreRow[];\n"
    "  const storesByProfile = new Map<string, string[]>();\n"
    "  memberships.forEach((membership) => {\n"
    "    storesByProfile.set(membership.profile_id, [\n"
    "      ...(storesByProfile.get(membership.profile_id) || []),\n"
    "      membership.store_id,\n"
    "    ]);\n"
    "  });\n"
    "  return profiles.map((profile) => ({\n"
    "    id: profile.id,\n"
    "    name: profile.name,\n"
    "    state: profile.state,\n"
    "    active: profile.active,\n"
    "    position: profile.position,\n"
    "    storeIds: storesByProfile.get(profile.id) || [],\n"
    "  }));\n"
    "}\n\n"
    "function mapQuoteItem(\n  row: QuoteItemRow,\n  items: Map<string, SupplyItem>,\n  needs: Map<string, { title: string }>,\n  stores: Map<string, Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>>,\n  destinations: SupplyQuoteItemDestination[],\n): SupplyQuoteItem {",
)

replace_once(
    path,
    "    capturedAt: row.captured_at,\n  };\n}\n\nexport async function listSupplyQuotes",
    "    capturedAt: row.captured_at,\n    position: row.position,\n    destinations,\n  };\n}\n\nexport async function listSupplyQuotes",
)

replace_once(
    path,
    "  const [quotesResult, quoteStoreRows, quoteItemRows, itemsResult, needsResult, storesResult] =\n    await Promise.all([",
    "  const [\n    quotesResult,\n    quoteStoreRows,\n    quoteItemRows,\n    quoteDestinationRows,\n    itemsResult,\n    needsResult,\n    storesResult,\n  ] = await Promise.all([",
)

replace_once(
    path,
    "      fetchAllPages<QuoteItemRow>((from, to) =>\n        supabase\n          .from('supply_quote_items')\n          .select('*')\n          .order('created_at')\n          .order('id')\n          .range(from, to),\n      ),\n      supabase.from('supply_items').select('*'),",
    "      fetchAllPages<QuoteItemRow>((from, to) =>\n        supabase\n          .from('supply_quote_items')\n          .select('*')\n          .order('created_at')\n          .order('id')\n          .range(from, to) as never,\n      ),\n      fetchAllPages<QuoteDestinationRow>((from, to) =>\n        supabase\n          .from('supply_quote_item_destinations' as never)\n          .select('*')\n          .order('quote_item_id')\n          .order('position')\n          .range(from, to) as never,\n      ),\n      supabase.from('supply_items').select('*'),",
)

replace_once(
    path,
    "  const quoteItems = new Map<string, SupplyQuoteItem[]>();\n  quoteItemRows.forEach((row) => {\n    const current = quoteItems.get(row.quote_id) || [];\n    current.push(mapQuoteItem(row, items, needs, stores));\n    quoteItems.set(row.quote_id, current);\n  });",
    "  const destinationsByItem = new Map<string, SupplyQuoteItemDestination[]>();\n  quoteDestinationRows.forEach((row) => {\n    const current = destinationsByItem.get(row.quote_item_id) || [];\n    current.push(mapQuoteDestination(row));\n    destinationsByItem.set(row.quote_item_id, current);\n  });\n  const quoteItems = new Map<string, SupplyQuoteItem[]>();\n  quoteItemRows.forEach((row) => {\n    const current = quoteItems.get(row.quote_id) || [];\n    current.push(mapQuoteItem(row, items, needs, stores, destinationsByItem.get(row.id) || []));\n    quoteItems.set(row.quote_id, current);\n  });",
)

print('freight types/repository patch applied')
