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

export async function saveQuotePaymentTerms(
  quoteId: string,
  terms: QuotePaymentTerms,
): Promise<void> {
  const { error } = await supabase.rpc('set_supply_quote_payment_terms' as never, {
    p_quote_id: quoteId,
    p_payment_method: terms.paymentMethod || null,
    p_entry_amount: terms.entryAmount || null,
    p_installment_count: terms.installmentCount ? Number(terms.installmentCount) : null,
    p_payment_notes: terms.paymentNotes,
  } as never);
  if (error) throw error;
}
