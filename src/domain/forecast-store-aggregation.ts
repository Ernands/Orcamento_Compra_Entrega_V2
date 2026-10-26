import type { ForecastDetail } from './budget-forecast';

/** View-only consolidation of the existing indicator evidence by store.
 * Source amounts are accumulated as integer cents. No financial calculation,
 * payment allocation, rounding rule, or budget forecast total is modified.
 */
export interface ForecastStoreAggregation {
  id: string;
  storeCode: string;
  storeName: string;
  state: string;
  amountCents: bigint;
  sourceRows: number;
}

export function aggregateForecastDetailsByStore(
  details: readonly ForecastDetail[],
): ForecastStoreAggregation[] {
  const groups = new Map<string, ForecastStoreAggregation>();
  for (const detail of details) {
    // Store codes are unique within the system. Keep state/name in the key to
    // avoid ever coalescing distinct identities if external records are flawed.
    const key = JSON.stringify([detail.storeCode,detail.state,detail.storeName]);
    const existing = groups.get(key);
    if (existing) {
      existing.amountCents += detail.amountCents;
      existing.sourceRows += 1;
    } else {
      groups.set(key,{
        id:key,
        storeCode:detail.storeCode,
        storeName:detail.storeName,
        state:detail.state,
        amountCents:detail.amountCents,
        sourceRows:1,
      });
    }
  }
  const collator = new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
  return [...groups.values()].sort((a,b)=>{
    // The undistributed Financeiro remainder is always visible at the bottom
    // and never silently allocated to an unrelated store.
    if(a.storeCode==='—' && b.storeCode!=='—')return 1;
    if(b.storeCode==='—' && a.storeCode!=='—')return -1;
    return collator.compare(a.state,b.state)
      || collator.compare(a.storeCode,b.storeCode)
      || collator.compare(a.storeName,b.storeName);
  });
}
