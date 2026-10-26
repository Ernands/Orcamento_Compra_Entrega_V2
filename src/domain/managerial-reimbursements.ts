import type { Store } from './types';
import type { FinanceOverviewStoreRow } from './finance-overview';

export type ManagerialReimbursementType = 'requested' | 'received' | 'finalized';
export type ManagerialReimbursementMovementType = Exclude<ManagerialReimbursementType,'finalized'>;
export interface ManagerialReimbursementEntry {
  id: string;
  storeId: string;
  type: ManagerialReimbursementType;
  amountCents: bigint;
  date: string;
  protocol: string;
  notes: string;
  reversalOf: string | null;
  createdBy: string;
  createdAt: string;
}
export type ReimbursementStatus = 'not_requested' | 'requested' | 'partial' | 'received' | 'finalized' | 'divergent';
export interface ManagerialReimbursementRow {
  storeId: string; code: string; name: string; city: string; state: string;
  storeStatus: 'Ativa' | 'Finalizada';
  realizedTotalCents: bigint;
  varianceToBbCents: bigint;
  requestedCents: bigint; receivedCents: bigint; absorbedCents: bigint; pendingCents: bigint;
  disbursementCents: bigint;
  reimbursementStatus: ReimbursementStatus;
  events: ManagerialReimbursementEntry[];
}
export const reimbursementStatusLabels: Record<ReimbursementStatus,string> = {
  not_requested:'Não solicitado', requested:'Solicitado',
  partial:'Parcialmente reembolsado', received:'Reembolsado', finalized:'Finalizado', divergent:'Divergência',
};
export function reimbursementStatus(requested: bigint, received: bigint): ReimbursementStatus {
  if (requested < 0n || received < 0n || received > requested) return 'divergent';
  if (requested === 0n) return received === 0n ? 'not_requested' : 'divergent';
  if (received === 0n) return 'requested';
  return received === requested ? 'received' : 'partial';
}
export function buildManagerialReimbursements(
  stores: Store[], overview: FinanceOverviewStoreRow[], entries: ManagerialReimbursementEntry[],
): ManagerialReimbursementRow[] {
  const byStore = new Map<string, ManagerialReimbursementEntry[]>();
  entries.forEach((entry) => byStore.set(entry.storeId,[...(byStore.get(entry.storeId)||[]),entry]));
  const storesById = new Map(stores.map((store)=>[store.id,store]));
  return overview.flatMap((row) => {
    const store = storesById.get(row.storeId);
    if (!store || (store.status !== 'active' && store.financialClosure?.state !== 'closed')) return [];
    const events = byStore.get(row.storeId) || [];
    // A BB budget alone does not indicate actual financial activity.
    if (![row.realizedTotalCents,row.paidCents,row.payableCents].some((c)=>c!==0n) && !events.length) return [];
    const requestedCents=events.filter((e)=>e.type==='requested').reduce((v,e)=>v+e.amountCents,0n);
    const receivedCents=events.filter((e)=>e.type==='received').reduce((v,e)=>v+e.amountCents,0n);
    // Each explicit finalization snapshots the amount irrevocably absorbed.
    // New requests after a finalized cycle do not change prior losses.
    const absorbedCents=events.filter((e)=>e.type==='finalized').reduce((v,e)=>v+e.amountCents,0n);
    const pendingCents=requestedCents-receivedCents-absorbedCents;
    const latest=events.reduce<ManagerialReimbursementEntry|null>((current,e)=>
      !current || e.createdAt > current.createdAt ? e : current,null);
    const status:ReimbursementStatus= pendingCents===0n && latest?.type==='finalized'
      ? 'finalized' : reimbursementStatus(requestedCents-absorbedCents,receivedCents);
    return [{
      storeId:row.storeId,code:row.code,name:row.name,city:row.city,state:row.state,
      storeStatus:store.financialClosure?.state==='closed'?'Finalizada' as const:'Ativa' as const,
      realizedTotalCents:row.realizedTotalCents,varianceToBbCents:row.realizedVarianceToBbCents,
      requestedCents,receivedCents,absorbedCents,pendingCents,
      disbursementCents:row.paidCents-receivedCents,
      reimbursementStatus:status,
      events:[...events].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),
    }];
  }).sort((a,b)=>a.state.localeCompare(b.state)||a.city.localeCompare(b.city));
}
export function managerialTotals(rows: ManagerialReimbursementRow[]) {
  const sum=(key:keyof Pick<ManagerialReimbursementRow,'realizedTotalCents'|'varianceToBbCents'|'requestedCents'|'receivedCents'|'absorbedCents'|'pendingCents'|'disbursementCents'>) =>
    rows.reduce((v,r)=>v+r[key],0n);
  return {
    realizedTotalCents:sum('realizedTotalCents'),varianceToBbCents:sum('varianceToBbCents'),
    requestedCents:sum('requestedCents'),receivedCents:sum('receivedCents'),absorbedCents:sum('absorbedCents'),
    pendingCents:sum('pendingCents'), disbursementCents:sum('disbursementCents'),
    pendingStores: rows.filter(r=>r.reimbursementStatus==='requested'||r.reimbursementStatus==='partial'||r.reimbursementStatus==='divergent').length,
  };
}
