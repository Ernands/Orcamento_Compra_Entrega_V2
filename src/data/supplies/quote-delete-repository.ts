import { supabase } from '../supabase/client';

export async function deleteSupplyQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc(
    'delete_supply_quote' as never,
    { p_quote_id: quoteId } as never,
  );
  if (error) throw error;
}
