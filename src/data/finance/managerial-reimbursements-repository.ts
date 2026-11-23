import { supabase } from '../supabase/client';
import { getWaveScopedStoreIds } from '../waves/wave-scope-repository';
import { fetchAllPages, fetchAllPagesForIds } from '../supabase/pagination';
import type { ManagerialReimbursementEntry, ManagerialReimbursementType } from '../../domain/managerial-reimbursements';
type Row = {
  id:string; store_id:string; entry_type:ManagerialReimbursementType;
  amount_cents:number|string; entry_date:string; protocol:string|null; notes:string|null;
  reversal_of:string|null; created_by:string; created_at:string;
};
const map=(r:Row):ManagerialReimbursementEntry=>({
  id:r.id,storeId:r.store_id,type:r.entry_type,amountCents:BigInt(r.amount_cents),
  date:r.entry_date,protocol:r.protocol||'',notes:r.notes||'',reversalOf:r.reversal_of,
  createdBy:r.created_by,createdAt:r.created_at,
});
export async function listManagerialReimbursements():Promise<ManagerialReimbursementEntry[]> {
  const storeIds = await getWaveScopedStoreIds();
  if (storeIds !== null && storeIds.length === 0) return [];
  // Do not silently truncate receipts at the Supabase API row cap: dropping a
  // reimbursement makes the displayed outstanding BB allowance incorrect.
  // Page under the selected store IDs, never fall back to a global read.
  const rows = storeIds === null
    ? await fetchAllPages<Row>((from, to) => supabase
      .from('finance_managerial_reimbursement_entries' as never)
      .select('*').order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(from, to))
    : await fetchAllPagesForIds<Row>(storeIds, (ids, from, to) => supabase
      .from('finance_managerial_reimbursement_entries' as never)
      .select('*').in('store_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(from, to));
  // Multiple ID batches may arrive in a different order than a global query.
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return rows.map(map);
}
export async function addManagerialReimbursement(values:{
  storeId:string; type:ManagerialReimbursementType; amountCents:bigint;
  date:string; protocol:string; notes:string; reversalOf?:string;
}):Promise<void> {
  if(!values.storeId||!values.date|| (values.type!=='finalized' && values.amountCents===0n))
    throw new Error('Informe loja, data e valor.');
  if(values.type==='finalized' && (values.amountCents<0n || values.reversalOf))
    throw new Error('Valor absorvido inválido para finalização.');
  const {error}=await supabase.from('finance_managerial_reimbursement_entries' as never)
    .insert({
      store_id:values.storeId,entry_type:values.type,amount_cents:values.amountCents.toString(),
      entry_date:values.date,protocol:values.protocol.trim()||null,
      notes:values.notes.trim()||null,reversal_of:values.reversalOf||null,
    } as never);
  if(error) throw new Error(error.message);
}

/** Finalize the reimbursement ledger and engage the Lojas financial lock
 * atomically. The server checks both permissions and the literal confirmation.
 * Any failure rolls back both writes; never call separate client mutations here.
 */
export async function finalizeReimbursementAndCloseStore(values:{
  storeId:string;lossCents:bigint;date:string;confirmation:string;
}):Promise<void> {
  if(!values.storeId||values.lossCents<0n||!values.date||values.confirmation!=='FINALIZAR')
    throw new Error('Dados de finalização ou confirmação inválidos.');
  const {error}=await supabase.rpc('finalize_managerial_reimbursement_and_close_store' as never,{
    p_store_id:values.storeId,
    p_loss_cents:values.lossCents.toString(),
    p_entry_date:values.date,
    p_confirm_text:values.confirmation,
  } as never);
  if(error)throw new Error(error.message);
}
