import type { SupplyQuoteValues } from '../../domain/types';
import { supabase } from '../supabase/client';
import type { PaymentMethod } from './purchases-repository';

export interface QuotePaymentTerms {
  paymentMethod: PaymentMethod | '';
  entryAmount: string;
  installmentCount: string;
  paymentNotes: string;
}

export const EMPTY_QUOTE_PAYMENT_TERMS: QuotePaymentTerms = {
  paymentMethod: '',
  entryAmount: '',
  installmentCount: '',
  paymentNotes: '',
};

type QuotePaymentRow = {
  payment_method: PaymentMethod | null;
  entry_amount: number | string | null;
  installment_count: number | null;
  payment_notes: string | null;
};

export async function getQuotePaymentTerms(quoteId: string): Promise<QuotePaymentTerms> {
  const { data, error } = await supabase
    .from('supply_quotes' as never)
    .select('payment_method,entry_amount,installment_count,payment_notes')
    .eq('id', quoteId)
    .single();
  if (error) throw error;
  const row = data as unknown as QuotePaymentRow;
  return {
    paymentMethod: row.payment_method || '',
    entryAmount: row.entry_amount === null ? '' : String(row.entry_amount),
    installmentCount: row.installment_count === null ? '' : String(row.installment_count),
    paymentNotes: row.payment_notes || '',
  };
}

export async function saveSupplyQuoteWithPaymentTerms(
  values: SupplyQuoteValues,
  terms: QuotePaymentTerms,
): Promise<string> {
  const items = values.items.map((item) => ({
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
  const { data, error } = await supabase.rpc('save_supply_quote_v2' as never, {
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
    p_payment_method: terms.paymentMethod || null,
    p_entry_amount: terms.entryAmount || null,
    p_installment_count: terms.installmentCount ? Number(terms.installmentCount) : null,
    p_payment_notes: terms.paymentNotes,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}
