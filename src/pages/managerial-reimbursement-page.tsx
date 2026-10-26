import { ArrowDownToLine, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ErrorState, InlineLoading, Modal } from '../components/ui';
import { useSession } from '../app/session-provider';
import { listStores } from '../data/stores/stores-repository';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listWorkServices, listFinanceStoreBudgets } from '../data/works/works-repository';
import { listPlannedBudget } from '../data/planned-budget/planned-budget-repository';
import { listFinanceReimbursements } from '../data/finance/finance-repository';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import { buildFinanceOverviewRows } from '../domain/finance-overview';
import { addManagerialReimbursement, listManagerialReimbursements } from '../data/finance/managerial-reimbursements-repository';
import { buildManagerialReimbursements, managerialTotals, reimbursementStatusLabels,
  type ManagerialReimbursementEntry, type ManagerialReimbursementRow, type ManagerialReimbursementType,
  type ReimbursementStatus } from '../domain/managerial-reimbursements';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import { FinanceAmount } from '../components/finance-amount';
import type { Store } from '../domain/types';
import type { FinanceOverviewStoreRow } from '../domain/finance-overview';
import './managerial-reimbursement-page.css';

type Dataset={stores:Store[]; overview:FinanceOverviewStoreRow[]; entries:ManagerialReimbursementEntry[]};
const today=()=>new Date().toLocaleDateString('en-CA');

export function ManagerialReimbursementPage() {
  const {can}=useSession();
  const canEdit=can('finance.manage') && can('dashboard.view');
  const [data,setData]=useState<Dataset|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [uf,setUf]=useState('');
  const [storeId,setStoreId]=useState('');
  const [implantation,setImplantation]=useState('all');
  const [status,setStatus]=useState<ReimbursementStatus|'all'>('all');
  const [selected,setSelected]=useState<ManagerialReimbursementRow|null>(null);
  const [kind,setKind]=useState<ManagerialReimbursementType>('requested');
  const [amount,setAmount]=useState('');
  const [entryDate,setEntryDate]=useState(today());
  const [protocol,setProtocol]=useState('');
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      // Legacy purchase reimbursements are consumed only to preserve Financeiro
      // source totals. Their requested/received amounts NEVER enter this ledger.
      const [stores,purchases,works,budgets,planned,legacy,entries]=await Promise.all([
        listStores(),listSupplyPurchasesV2(),listWorkServices(),listFinanceStoreBudgets(),
        listPlannedBudget(),listFinanceReimbursements(),listManagerialReimbursements(),
      ]);
      const purchaseStoreRows=buildFinanceStoreRows(purchases,legacy);
      setData({stores,entries,overview:buildFinanceOverviewRows({
        stores,purchases,works,budgets,purchaseStoreRows,plannedBudgetItems:planned.items,
      })});
    }catch(e){setError(e instanceof Error?e.message:'Erro ao carregar reembolsos.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const allRows=useMemo(()=>data?buildManagerialReimbursements(data.stores,data.overview,data.entries):[],[data]);
  const states=useMemo(()=>[...new Set(allRows.map(r=>r.state))].sort(),[allRows]);
  const shown=useMemo(()=>allRows.filter(r=>(!uf||r.state===uf)&&(!storeId||r.storeId===storeId)
    &&(implantation==='all'||(implantation==='closed'?r.storeStatus==='Finalizada':r.storeStatus==='Ativa'))
    &&(status==='all'||r.reimbursementStatus===status)),[allRows,uf,storeId,implantation,status]);
  const totals=useMemo(()=>managerialTotals(shown),[shown]);
  const open=(row:ManagerialReimbursementRow)=>{
    setSelected(row);setKind('requested');setAmount('');setEntryDate(today());
    setProtocol('');setNotes('');setFormError('');
  };
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(!selected||saving)return;
    let cents:bigint;
    try {cents=moneyToCents(amount);if(cents<=0n)throw Error('Informe um valor maior que zero.');
      if(!entryDate)throw Error('Informe a data.');
    }catch(e){setFormError(e instanceof Error?e.message:'Valor inválido.');return;}
    setSaving(true);setFormError('');
    try{await addManagerialReimbursement({
      storeId:selected.storeId,type:kind,amountCents:cents,date:entryDate,protocol,notes,
    });await load();setSelected(null);}
    catch(e){setFormError(e instanceof Error?e.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  };
  const reverse=async(entry:ManagerialReimbursementEntry)=>{
    if(!selected||saving||entry.reversalOf||selected.events.some(e=>e.reversalOf===entry.id))return;
    if(!window.confirm('Estornar este lançamento? A movimentação original ficará preservada no histórico.'))return;
    setSaving(true);setFormError('');
    try{await addManagerialReimbursement({
      storeId:selected.storeId,type:entry.type,amountCents:-entry.amountCents,
      date:today(),protocol:entry.protocol,notes:'Estorno do lançamento de '+entry.date,
      reversalOf:entry.id,
    });await load();setSelected(null);}
    catch(e){setFormError(e instanceof Error?e.message:'Não foi possível estornar.');}
    finally{setSaving(false);}
  };
  const csv=()=>{
    const esc=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
    const numeric=(v:bigint)=>String(v<0n?'-':'')+String((v<0n?-v:v)/100n)+','+
      String((v<0n?-v:v)%100n).padStart(2,'0');
    const lines=[
      ['Loja','UF','Situação da loja','Realizado total','Dif. em relação à verba','Solicitado',
       'Reembolsado','Pendente','Situação do reembolso'],
      ...shown.map(r=>[r.code+' · '+r.name,r.state,r.storeStatus,numeric(r.realizedTotalCents),
        numeric(r.varianceToBbCents),numeric(r.requestedCents),numeric(r.receivedCents),
        numeric(r.pendingCents),reimbursementStatusLabels[r.reimbursementStatus]]),
    ];
    const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(esc).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download='Reembolso_Gerencial_Implanta27.csv';a.click();URL.revokeObjectURL(url);
  };
  const summary=[
    {label:'Realizado total',value:totals.realizedTotalCents,group:'execution'},
    {label:'Dif. em relação à verba',value:totals.varianceToBbCents,group:'planning'},
    {label:'Total solicitado',value:totals.requestedCents,group:'finance'},
    {label:'Total reembolsado',value:totals.receivedCents,group:'finance'},
    {label:'Pendente de reembolso',value:totals.pendingCents,group:'tracking'},
  ];
  return <section className="page-stack managerial-refunds">
    <header className="page-heading">
      <div><p className="eyebrow">Dashboard | Gerencial</p><h2>Reembolso</h2>
        <p>Controle gerencial de solicitações e recebimentos por loja, independente dos pedidos de compra.</p></div>
      <button className="button button--secondary" onClick={()=>void load()} disabled={loading}>
        <RefreshCcw size={16}/> Atualizar</button>
    </header>
    {loading?<InlineLoading label="Consultando reembolsos"/>:error?<ErrorState message={error} onRetry={()=>void load()}/>:<>
      <div className="managerial-refunds__summary">
        {summary.map(x=><article key={x.label} className={'managerial-refunds__metric managerial-refunds__metric--'+x.group}>
          <small>{x.label}</small><FinanceAmount cents={x.value}/></article>)}
        <article className="managerial-refunds__metric managerial-refunds__metric--tracking">
          <small>Lojas com pendências</small><strong>{totals.pendingStores}</strong></article>
      </div>
      <div className="managerial-refunds__filters">
        <label>UF <select value={uf} onChange={e=>{setUf(e.target.value);setStoreId('');}}>
          <option value="">Todas</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Loja <select value={storeId} onChange={e=>setStoreId(e.target.value)}>
          <option value="">Todas</option>{allRows.filter(r=>!uf||r.state===uf).map(r=>
            <option key={r.storeId} value={r.storeId}>{r.code} · {r.city}/{r.state}</option>)}</select></label>
        <label>Situação da implantação <select value={implantation} onChange={e=>setImplantation(e.target.value)}>
          <option value="all">Todas</option><option value="open">Em andamento</option><option value="closed">Finalizadas</option></select></label>
        <label>Situação do reembolso <select value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
          <option value="all">Todas</option>{Object.entries(reimbursementStatusLabels).map(([key,label])=>
            <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button button--secondary" onClick={()=>{
          setUf('');setStoreId('');setImplantation('all');setStatus('all');}}>Limpar</button>
        <button className="button button--secondary" onClick={csv} disabled={!shown.length}>
          <ArrowDownToLine size={16}/> Exportar Excel (CSV)</button>
      </div>
      <div className="managerial-refunds__table-scroll">
        <table className="managerial-refunds__table"><thead><tr>
          <th>Loja · Cidade/UF</th><th>Realizado total</th><th>Dif. em relação à verba</th>
          <th>Valor solicitado</th><th>Valor reembolsado</th><th>Situação da loja</th><th>Ações</th>
        </tr></thead><tbody>
          {shown.map(r=><tr key={r.storeId}>
            <td><strong>{r.code} · {r.name}</strong><small>{r.city}/{r.state}</small></td>
            <td><FinanceAmount cents={r.realizedTotalCents}/></td>
            <td className={r.varianceToBbCents<0n?'value-negative':'value-positive'}>
              <FinanceAmount cents={r.varianceToBbCents}/></td>
            <td><FinanceAmount cents={r.requestedCents}/></td>
            <td><FinanceAmount cents={r.receivedCents}/></td>
            <td>{r.storeStatus}</td>
            <td><button className="button button--secondary button--small" onClick={()=>open(r)}>
              {canEdit?'Gerenciar':'Histórico'}</button></td>
          </tr>)}
          {!shown.length&&<tr><td colSpan={7}>Nenhuma loja com movimentação financeira encontrada nos filtros.</td></tr>}
        </tbody></table>
      </div>
      <p className="managerial-refunds__footnote">Pendente = solicitado − recebido. Realizado total e diferença em relação à verba provêm do Financeiro; valores gerenciais não alteram custos nem pagamentos.</p>
    </>}
    <Modal open={Boolean(selected)} onClose={()=>setSelected(null)}
      title={selected?'Reembolso · '+selected.code+' · '+selected.city+'/'+selected.state:'Reembolso'}
      description="Lançamentos auditáveis, sem sobrescrever o histórico.">
      {selected&&<div className="managerial-refunds__modal">
        <div className="managerial-refunds__modal-summary">
          <span>Solicitado: {formatBRL(selected.requestedCents)}</span>
          <span>Recebido: {formatBRL(selected.receivedCents)}</span>
          <span>Pendente: {formatBRL(selected.pendingCents)}</span>
          <strong>{reimbursementStatusLabels[selected.reimbursementStatus]}</strong>
        </div>
        {canEdit&&<form onSubmit={e=>void submit(e)} className="managerial-refunds__form">
          <label>Movimentação<select value={kind} onChange={e=>setKind(e.target.value as ManagerialReimbursementType)}>
            <option value="requested">Solicitação</option><option value="received">Recebimento</option></select></label>
          <label>Valor (R$)<input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label>
          <label>Data<input required type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
          <label>Protocolo / referência<input value={protocol} onChange={e=>setProtocol(e.target.value)} maxLength={180}/></label>
          <label className="managerial-refunds__wide">Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/></label>
          {formError&&<p role="alert" className="value-negative">{formError}</p>}
          <button disabled={saving} type="submit" className="button button--primary"><Plus size={16}/> Registrar movimentação</button>
        </form>}
        <h3>Histórico de movimentações</h3>
        <div className="managerial-refunds__history">
          {selected.events.length?selected.events.map(entry=><div key={entry.id}>
            <div><strong>{entry.type==='requested'?'Solicitação':'Recebimento'}</strong>
              {entry.reversalOf&&<small> · Estorno</small>}
              <small> · {entry.date} · {entry.protocol||'Sem protocolo'}</small>
              <small> · Autor: {entry.createdBy}</small>
              {entry.notes&&<p>{entry.notes}</p>}
            </div>
            <FinanceAmount cents={entry.amountCents}/>
            {canEdit&&!entry.reversalOf&&!selected.events.some(e=>e.reversalOf===entry.id)&&
              <button type="button" disabled={saving} className="button button--secondary button--small"
                onClick={()=>void reverse(entry)}><RotateCcw size={14}/> Estornar</button>}
          </div>):<p>Nenhuma movimentação registrada.</p>}
        </div>
        {formError&&<p role="alert" className="value-negative">{formError}</p>}
      </div>}
    </Modal>
  </section>;
}
