import { supabase } from '../supabase/client';
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
  const {data,error}=await supabase.from('finance_managerial_reimbursement_entries' as never)
    .select('*').order('created_at',{ascending:false}).limit(5000);
  if(error) throw new Error(error.message);
  return ((data||[]) as Row[]).map(map);
}
export async function addManagerialReimbursement(values:{
  storeId:string; type:ManagerialReimbursementType; amountCents:bigint;
  date:string; protocol:string; notes:string; reversalOf?:string;
}):Promise<void> {
  if(!values.storeId||!values.date||values.amountCents===0n) throw new Error('Informe loja, data e valor.');
  const {error}=await supabase.from('finance_managerial_reimbursement_entries' as never)
    .insert({
      store_id:values.storeId,entry_type:values.type,amount_cents:values.amountCents.toString(),
      entry_date:values.date,protocol:values.protocol.trim()||null,
      notes:values.notes.trim()||null,reversal_of:values.reversalOf||null,
    } as never);
  if(error) throw new Error(error.message);
}
