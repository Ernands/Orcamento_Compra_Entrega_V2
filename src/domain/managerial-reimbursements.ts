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
  bbCents: bigint;
  realizedTotalCents: bigint;
  varianceToBbCents: bigint;
  requestedCents: bigint; receivedCents: bigint; absorbedCents: bigint; pendingCents: bigint;
  extraCents: bigint; eligibleCents: bigint; recordedLossCents: bigint;
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
export interface ManagerialReimbursementFinancials {
  requestedCents:bigint;
  receivedCents:bigint;
  absorbedCents:bigint;
  recordedLossCents:bigint;
  eligibleCents:bigint;
  extraCents:bigint;
  pendingCents:bigint;
  reimbursementStatus:ReimbursementStatus;
}
/** Separate amounts eligible for BB reimbursement from expenses above the original
 * BB allowance. Only an explicit finalized event recognizes an absorbed loss.
 * The value is reconciled from the current realized/received amounts, so legacy
 * closures that recorded zero do not silently exclude eligible unreimbursed costs.
 */
export function calculateManagerialReimbursementFinancials(
  bbCents:bigint,realizedTotalCents:bigint,events:ManagerialReimbursementEntry[],
):ManagerialReimbursementFinancials {
  const positive=(v:bigint)=>v>0n?v:0n;
  const eligibleCents=realizedTotalCents>bbCents?positive(bbCents):positive(realizedTotalCents);
  const extraCents=positive(realizedTotalCents-positive(bbCents));
  const chronological=[...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  let requestedCents=0n,receivedCents=0n,recordedLossCents=0n;
  let lastClosingReceived:bigint|null=null,lastCloseIndex=-1;
  chronological.forEach((e,index)=>{
    if(e.type==='requested') requestedCents+=e.amountCents;
    if(e.type==='received') receivedCents+=e.amountCents;
    if(e.type==='finalized'){
      recordedLossCents+=e.amountCents;
      lastClosingReceived=receivedCents;
      lastCloseIndex=index;
    }
  });
  const unreceivedEligible=positive(eligibleCents-receivedCents);
  const financialLossAtClosure=lastClosingReceived===null?0n:positive(eligibleCents-lastClosingReceived);
  // Previously registered losses and eligible nonreimbursed costs at the most
  // recent closure; cap against today's remaining eligible amount.
  const absorbedCents=lastClosingReceived===null?0n:
    (recordedLossCents>financialLossAtClosure?recordedLossCents:financialLossAtClosure)
    <unreceivedEligible?
      (recordedLossCents>financialLossAtClosure?recordedLossCents:financialLossAtClosure):
      unreceivedEligible;
  const latest=chronological[chronological.length-1];
  // Pending/excess belong only to the current open request cycle. A finalized
  // request is settled even when a part of its expense was absorbed as a loss.
  const opened=lastCloseIndex===-1?chronological:chronological.slice(lastCloseIndex+1);
  const openRequested=opened.filter(e=>e.type==='requested').reduce((v,e)=>v+e.amountCents,0n);
  const openReceived=opened.filter(e=>e.type==='received').reduce((v,e)=>v+e.amountCents,0n);
  const pendingCents=latest?.type==='finalized'?0n:openRequested-openReceived;
  let status:ReimbursementStatus;
  if(latest?.type==='finalized')status='finalized';
  else if(pendingCents<0n||receivedCents>eligibleCents||receivedCents<0n)status='divergent';
  else if(openRequested===0n)status='not_requested';
  else if(openReceived===0n)status='requested';
  else if(pendingCents===0n)status='received';
  else status='partial';
  return {requestedCents,receivedCents,absorbedCents,recordedLossCents,
    eligibleCents,extraCents,pendingCents,reimbursementStatus:status};
}
export function buildManagerialReimbursements(
  stores: Store[], overview: FinanceOverviewStoreRow[], entries: ManagerialReimbursementEntry[],
): ManagerialReimbursementRow[] {
  const byStore=new Map<string,ManagerialReimbursementEntry[]>();
  entries.forEach(entry=>byStore.set(entry.storeId,[...(byStore.get(entry.storeId)||[]),entry]));
  const storesById=new Map(stores.map(store=>[store.id,store]));
  return overview.flatMap((row)=>{
    const store=storesById.get(row.storeId);
    if(!store||(store.status!=='active'&&store.financialClosure?.state!=='closed'))return [];
    const events=byStore.get(row.storeId)||[];
    if(![row.realizedTotalCents,row.paidCents,row.payableCents].some(v=>v!==0n)&&!events.length)return [];
    const financials=calculateManagerialReimbursementFinancials(
      row.budgetBbCents,row.realizedTotalCents,events);
    return [{
      storeId:row.storeId,code:row.code,name:row.name,city:row.city,state:row.state,
      storeStatus:store.financialClosure?.state==='closed'?'Finalizada' as const:'Ativa' as const,
      bbCents:row.budgetBbCents,realizedTotalCents:row.realizedTotalCents,
      varianceToBbCents:row.realizedVarianceToBbCents,
      ...financials,disbursementCents:row.paidCents-financials.receivedCents,
      events:[...events].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),
    }];
  }).sort((a,b)=>a.state.localeCompare(b.state)||a.city.localeCompare(b.city));
}
export function managerialTotals(rows: ManagerialReimbursementRow[]) {
  const sum=(key:keyof Pick<ManagerialReimbursementRow,'bbCents'|'realizedTotalCents'|'varianceToBbCents'|'requestedCents'|'receivedCents'|'absorbedCents'|'pendingCents'|'extraCents'|'eligibleCents'|'disbursementCents'>) =>
    rows.reduce((v,r)=>v+r[key],0n);
  return {
    bbCents:sum('bbCents'),realizedTotalCents:sum('realizedTotalCents'),
    varianceToBbCents:sum('varianceToBbCents'),
    requestedCents:sum('requestedCents'),receivedCents:sum('receivedCents'),absorbedCents:sum('absorbedCents'),
    pendingCents:sum('pendingCents'),extraCents:sum('extraCents'),eligibleCents:sum('eligibleCents'),
    disbursementCents:sum('disbursementCents'),
    pendingStores: rows.filter(r=>r.reimbursementStatus==='requested'||r.reimbursementStatus==='partial'||r.reimbursementStatus==='divergent').length,
  };
}

/** Immutable settlement breakdown, including historical reversals. */
export type ManagerialSettlement = {receivedCents:bigint;absorbedCents:bigint};
export function managerialSettlementsByStore(
  entries:ManagerialReimbursementEntry[],
  overview?:FinanceOverviewStoreRow[],
):ReadonlyMap<string,ManagerialSettlement> {
  const settlements=new Map<string,ManagerialSettlement>();
  const entriesByStore=new Map<string,ManagerialReimbursementEntry[]>();
  entries.forEach(e=>entriesByStore.set(e.storeId,[...(entriesByStore.get(e.storeId)||[]),e]));
  if(overview){
    overview.forEach(row=>{
      const computed=calculateManagerialReimbursementFinancials(
        row.budgetBbCents,row.realizedTotalCents,entriesByStore.get(row.storeId)||[]);
      settlements.set(row.storeId,{receivedCents:computed.receivedCents,absorbedCents:computed.absorbedCents});
    });
  }else{
    entries.forEach(entry=>{
      if(entry.type==='requested')return;
      const current=settlements.get(entry.storeId)||{receivedCents:0n,absorbedCents:0n};
      if(entry.type==='received')current.receivedCents+=entry.amountCents;
      if(entry.type==='finalized')current.absorbedCents+=entry.amountCents;
      settlements.set(entry.storeId,current);
    });
  }
  return settlements;
}

/** A positive difference remains pending until an explicit finalization.
 * A negative difference is a BB receipt above the net requested amount.
 * A finalized loss is preserved even if a later reimbursement cycle opens.
 */
export type ManagerialBalanceKind = 'pending' | 'loss' | 'excess' | 'settled';
export interface ManagerialBalanceLine {
  kind: ManagerialBalanceKind;
  label: string;
  amountCents: bigint;
}
export function reimbursementBalanceLines(
  row: Pick<ManagerialReimbursementRow, 'pendingCents' | 'absorbedCents'>,
): ManagerialBalanceLine[] {
  const lines: ManagerialBalanceLine[] = [];
  if(row.absorbedCents>0n) lines.push({kind:'loss',label:'Perda absorvida',amountCents:row.absorbedCents});
  if(row.pendingCents>0n) lines.push({kind:'pending',label:'Pendente',amountCents:row.pendingCents});
  else if(row.pendingCents<0n) lines.push({kind:'excess',label:'Acima do solicitado',amountCents:-row.pendingCents});
  if(!lines.length) lines.push({kind:'settled',label:'Sem saldo',amountCents:0n});
  return lines;
}
export function reimbursementWorkflowStatus(row:Pick<ManagerialReimbursementRow,'reimbursementStatus'>):
  'Aberto'|'Finalizado' {
  return row.reimbursementStatus==='finalized'?'Finalizado':'Aberto';
}
