import type {
  Store,
  Supplier,
  SupplierChannel,
  SupplierValues,
  SupplyItem,
  SupplyItemDetail,
  SupplyItemValues,
  SupplyNeed,
  SupplyQuote,
  SupplyQuoteItem,
  SupplyQuoteStatus,
  SupplyQuoteValues,
} from '../../domain/types';
import { supabase } from '../supabase/client';
import type { Database, Json } from '../supabase/database.types';
import { fetchAllPages } from '../supabase/pagination';

type ItemRow = Database['public']['Tables']['supply_items']['Row'];
type SupplierTableRow = Database['public']['Tables']['suppliers']['Row'];
type ChannelRow = Database['public']['Tables']['supplier_channels']['Row'];
type QuoteRow = Database['public']['Tables']['supply_quotes']['Row'];
type QuoteStoreRow = Database['public']['Tables']['supply_quote_stores']['Row'];
type QuoteItemRow = Database['public']['Tables']['supply_quote_items']['Row'];
type SupplierOperationalRow = Pick<
  SupplierTableRow,
  | 'id'
  | 'codigo_negocio'
  | 'trade_name'
  | 'legal_name'
  | 'person_type'
  | 'contact_name'
  | 'phone'
  | 'email'
  | 'website'
  | 'city'
  | 'state'
  | 'address'
  | 'notes'
  | 'active'
>;
type SupplierListRow = SupplierOperationalRow & { document: string | null };

const SUPPLIER_OPERATIONAL_COLUMNS =
  'id,codigo_negocio,trade_name,legal_name,person_type,contact_name,phone,email,website,city,state,address,notes,active';

function mapItem(row: ItemRow): SupplyItem {
  return {
    id: row.id,
    code: row.codigo_negocio,
    name: row.name,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    groupName: row.group_name,
    areaName: row.area_name,
    type: row.item_type,
    defaultUnit: row.default_unit,
    defaultQuantity: row.default_quantity === null ? null : Number(row.default_quantity),
    brandReference: row.brand_reference,
    technicalSpecification: row.technical_specification,
    productLink: row.product_link,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChannel(row: ChannelRow): SupplierChannel {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    type: row.channel_type,
    label: row.label,
    city: row.city,
    state: row.state,
    servesNationally: row.serves_nationally,
    active: row.active,
  };
}

export async function listSupplyItems(): Promise<SupplyItem[]> {
  const { data, error } = await supabase.from('supply_items').select('*').order('name');
  if (error) throw error;
  return data.map(mapItem);
}

function itemPayload(values: SupplyItemValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    category: values.category.trim(),
    subcategory: values.subcategory.trim() || null,
    group_name: values.groupName.trim() || null,
    area_name: values.areaName.trim() || null,
    item_type: values.type,
    default_unit: values.defaultUnit.trim(),
    default_quantity: values.defaultQuantity ? Number(values.defaultQuantity) : null,
    brand_reference: values.brandReference.trim() || null,
    technical_specification: values.technicalSpecification.trim() || null,
    product_link: values.productLink.trim() || null,
    active: values.active,
  };
}

export async function createSupplyItem(values: SupplyItemValues): Promise<SupplyItem> {
  const { data, error } = await supabase
    .from('supply_items')
    .insert(itemPayload(values))
    .select('*')
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function updateSupplyItem(
  itemId: string,
  values: SupplyItemValues,
): Promise<SupplyItem> {
  const { data, error } = await supabase
    .from('supply_items')
    .update(itemPayload(values))
    .eq('id', itemId)
    .select('*')
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function getSupplyItemDetail(itemId: string): Promise<SupplyItemDetail> {
  const [itemResult, needs, quoteItemsResult] = await Promise.all([
    supabase.from('supply_items').select('*').eq('id', itemId).single(),
    listSupplyNeeds(),
    supabase
      .from('supply_quote_items')
      .select('id, quote_id, quantity, unit, unit_price')
      .eq('supply_item_id', itemId)
      .order('created_at', { ascending: false }),
  ]);

  if (itemResult.error) throw itemResult.error;
  if (quoteItemsResult.error) throw quoteItemsResult.error;

  const quoteIds = [...new Set(quoteItemsResult.data.map((usage) => usage.quote_id))];
  const quotesResult = quoteIds.length
    ? await supabase
        .from('supply_quotes')
        .select('id, codigo_negocio, supplier_name_snapshot, status, quote_date')
        .in('id', quoteIds)
    : { data: [], error: null };

  if (quotesResult.error) throw quotesResult.error;
  const quotes = new Map(quotesResult.data.map((quote) => [quote.id, quote]));

  return {
    item: mapItem(itemResult.data),
    needs: needs.filter((need) => need.supplyItemId === itemId),
    quoteUsages: quoteItemsResult.data.flatMap((usage) => {
      const quote = quotes.get(usage.quote_id);
      if (!quote) return [];
      return [
        {
          id: usage.id,
          quoteId: quote.id,
          quoteCode: quote.codigo_negocio,
          supplierName: quote.supplier_name_snapshot,
          status: quote.status,
          quoteDate: quote.quote_date,
          quantity: Number(usage.quantity),
          unit: usage.unit,
          unitPrice: Number(usage.unit_price),
        },
      ];
    }),
  };
}

export async function listSupplyNeeds(): Promise<SupplyNeed[]> {
  const [needsResult, storesResult] = await Promise.all([
    supabase.from('store_needs').select('*').order('created_at', { ascending: false }),
    supabase.from('lojas').select('id, codigo_negocio, nome, cidade, uf'),
  ]);
  if (needsResult.error) throw needsResult.error;
  if (storesResult.error) throw storesResult.error;

  const stores = new Map(storesResult.data.map((store) => [store.id, store]));
  return needsResult.data.flatMap((need) => {
    const store = stores.get(need.store_id);
    if (!store) return [];
    return [
      {
        id: need.id,
        storeId: need.store_id,
        title: need.title,
        description: need.description,
        category: need.category,
        quantity: Number(need.quantity),
        unit: need.unit,
        priority: need.priority,
        status: need.status,
        notes: need.notes,
        origin: need.origin,
        sourceImplementationItemId: need.source_implementation_item_id,
        supplyItemId: need.supply_item_id,
        createdAt: need.created_at,
        storeCode: store.codigo_negocio,
        storeName: store.nome,
        storeCity: store.cidade,
        storeState: store.uf,
      },
    ];
  });
}

export async function linkNeedToSupplyItem(needId: string, supplyItemId: string): Promise<void> {
  const { error } = await supabase.rpc('link_store_need_item', {
    p_need_id: needId,
    p_supply_item_id: supplyItemId,
  });
  if (error) throw error;
}

async function loadSupplierRows(includeDocument: boolean): Promise<SupplierListRow[]> {
  if (includeDocument) {
    const { data, error } = await supabase.rpc('list_suppliers_for_management');
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('suppliers')
    .select(SUPPLIER_OPERATIONAL_COLUMNS)
    .order('trade_name');
  if (error) throw error;
  return data.map((row) => ({ ...row, document: null }));
}

export async function listSuppliers(includeDocument = false): Promise<Supplier[]> {
  const [supplierRows, channelsResult, quotesResult] = await Promise.all([
    loadSupplierRows(includeDocument),
    supabase.from('supplier_channels').select('*').order('created_at'),
    supabase.from('supply_quotes').select('supplier_id, quote_date').order('quote_date', {
      ascending: false,
    }),
  ]);
  if (channelsResult.error) throw channelsResult.error;
  if (quotesResult.error) throw quotesResult.error;

  const channels = new Map<string, SupplierChannel[]>();
  channelsResult.data.forEach((row) => {
    const current = channels.get(row.supplier_id) || [];
    current.push(mapChannel(row));
    channels.set(row.supplier_id, current);
  });
  const latestQuotes = new Map<string, string>();
  quotesResult.data.forEach((quote) => {
    if (!latestQuotes.has(quote.supplier_id)) latestQuotes.set(quote.supplier_id, quote.quote_date);
  });

  return supplierRows.map((row) => ({
    id: row.id,
    code: row.codigo_negocio,
    tradeName: row.trade_name,
    legalName: row.legal_name,
    personType: row.person_type,
    document: row.document,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    city: row.city,
    state: row.state,
    address: row.address,
    notes: row.notes,
    active: row.active,
    channels: channels.get(row.id) || [],
    latestQuoteDate: latestQuotes.get(row.id) || null,
  }));
}

export async function saveSupplier(values: SupplierValues): Promise<string> {
  const { data, error } = await supabase.rpc('save_supplier', {
    p_supplier_id: values.id || null,
    p_trade_name: values.tradeName,
    p_legal_name: values.legalName,
    p_person_type: values.personType,
    p_document: values.document,
    p_contact_name: values.contactName,
    p_phone: values.phone,
    p_email: values.email,
    p_website: values.website,
    p_city: values.city,
    p_state: values.state,
    p_address: values.address,
    p_notes: values.notes,
    p_active: values.active,
    p_channel_id: values.channelId || null,
    p_channel_type: values.channelType,
    p_channel_label: values.channelLabel,
    p_channel_city: values.channelCity,
    p_channel_state: values.channelState,
    p_serves_nationally: values.servesNationally,
    p_channel_active: values.channelActive,
  } as never);
  if (error) throw error;
  return data;
}

function mapQuoteItem(
  row: QuoteItemRow,
  items: Map<string, SupplyItem>,
  needs: Map<string, { title: string }>,
  stores: Map<string, Pick<Store, 'id' | 'code' | 'name' | 'city' | 'state'>>,
): SupplyQuoteItem {
  const item = items.get(row.supply_item_id);
  const store = row.store_id ? stores.get(row.store_id) : null;
  return {
    id: row.id,
    quoteId: row.quote_id,
    supplyItemId: row.supply_item_id,
    itemCode: item?.code || 'Item indisponivel',
    itemName: item?.name || 'Item indisponivel',
    storeNeedId: row.store_need_id,
    needTitle: row.store_need_id ? needs.get(row.store_need_id)?.title || null : null,
    storeId: row.store_id,
    storeCode: store?.code || null,
    storeName: store?.name || null,
    quantity: String(row.quantity),
    unit: row.unit,
    unitPrice: String(row.unit_price),
    discountAmount: String(row.discount_amount),
    shippingType: row.shipping_type,
    shippingAmount: row.shipping_amount === null ? null : String(row.shipping_amount),
    otherCosts: String(row.other_costs),
    deliveryDays: row.delivery_days,
    minimumQuantity: row.minimum_quantity === null ? null : String(row.minimum_quantity),
    offeredBrandModel: row.offered_brand_model,
    notes: row.notes,
    productUrl: row.product_url,
    capturedAt: row.captured_at,
  };
}

export async function listSupplyQuotes(): Promise<SupplyQuote[]> {
  const [quotesResult, quoteStoreRows, quoteItemRows, itemsResult, needsResult, storesResult] =
    await Promise.all([
      supabase.from('supply_quotes').select('*').order('quote_date', { ascending: false }),
      fetchAllPages<QuoteStoreRow>((from, to) =>
        supabase
          .from('supply_quote_stores')
          .select('*')
          .order('quote_id')
          .order('store_id')
          .range(from, to),
      ),
      fetchAllPages<QuoteItemRow>((from, to) =>
        supabase
          .from('supply_quote_items')
          .select('*')
          .order('created_at')
          .order('id')
          .range(from, to),
      ),
      supabase.from('supply_items').select('*'),
      supabase.from('store_needs').select('id, title'),
      supabase.from('lojas').select('id, codigo_negocio, nome, cidade, uf'),
    ]);
  const error =
    quotesResult.error || itemsResult.error || needsResult.error || storesResult.error;
  if (error) throw error;

  const items = new Map(itemsResult.data.map((row) => [row.id, mapItem(row)]));
  const needs = new Map(needsResult.data.map((row) => [row.id, row]));
  const stores = new Map(
    storesResult.data.map((row) => [
      row.id,
      { id: row.id, code: row.codigo_negocio, name: row.nome, city: row.cidade, state: row.uf },
    ]),
  );
  const quoteStores = new Map<string, SupplyQuote['stores']>();
  quoteStoreRows.forEach((row) => {
    const store = stores.get(row.store_id);
    if (!store) return;
    const current = quoteStores.get(row.quote_id) || [];
    current.push(store);
    quoteStores.set(row.quote_id, current);
  });
  const quoteItems = new Map<string, SupplyQuoteItem[]>();
  quoteItemRows.forEach((row) => {
    const current = quoteItems.get(row.quote_id) || [];
    current.push(mapQuoteItem(row, items, needs, stores));
    quoteItems.set(row.quote_id, current);
  });

  return quotesResult.data.map((row: QuoteRow) => ({
    id: row.id,
    code: row.codigo_negocio,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name_snapshot,
    supplierChannelId: row.supplier_channel_id,
    channel: row.channel_snapshot,
    originCity: row.origin_city_snapshot,
    originState: row.origin_state_snapshot,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    contact: row.contact_snapshot,
    contextType: row.context_type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    stores: quoteStores.get(row.id) || [],
    items: quoteItems.get(row.id) || [],
  }));
}

export async function saveSupplyQuote(values: SupplyQuoteValues): Promise<string> {
  const items: Json = values.items.map((item) => ({
    supply_item_id: item.supplyItemId,
    store_need_id: item.storeNeedId || null,
    store_id: item.storeId || null,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unitPrice,
    discount_amount: item.discountAmount || '0',
    shipping_type: item.shippingType,
    shipping_amount: item.shippingType === 'informed' ? item.shippingAmount : null,
    other_costs: item.otherCosts || '0',
    delivery_days: item.deliveryDays || null,
    minimum_quantity: item.minimumQuantity || null,
    offered_brand_model: item.offeredBrandModel || null,
    notes: item.notes || null,
    product_url: item.productUrl || null,
    captured_at: item.capturedAt ? new Date(item.capturedAt).toISOString() : null,
  }));
  const { data, error } = await supabase.rpc('save_supply_quote', {
    p_quote_id: values.id || null,
    p_supplier_id: values.supplierId,
    p_supplier_channel_id: values.supplierChannelId,
    p_quote_date: values.quoteDate,
    p_valid_until: values.validUntil || null,
    p_contact: values.contact,
    p_context_type: values.contextType,
    p_status: values.status,
    p_notes: values.notes,
    p_store_ids: values.storeIds,
    p_items: items,
  } as never);
  if (error) throw error;
  return data;
}

export async function setSupplyQuoteStatus(
  quoteId: string,
  status: SupplyQuoteStatus,
): Promise<void> {
  const { error } = await supabase.rpc('set_supply_quote_status', {
    p_quote_id: quoteId,
    p_status: status,
  });
  if (error) throw error;
}

export async function deleteSupplyQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_supply_quote', { p_quote_id: quoteId });
  if (error) throw error;
}
