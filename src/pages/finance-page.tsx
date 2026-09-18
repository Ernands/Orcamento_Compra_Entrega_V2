import {
  BanknoteArrowDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Landmark,
  MapPinned,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import {
  downloadFinanceOverviewExcel,
  downloadFinanceOverviewPdf,
} from '../data/exports/finance-exports';
import {
  listFinanceReimbursements,
  saveFinanceReimbursement,
} from '../data/finance/finance-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  listFinanceStoreBudgets,
  listWorkServices,
  saveFinanceStoreBudget,
} from '../data/works/works-repository';
import {
  createPurchaseAttachmentSignedUrlV2,
  listSupplyPurchasesV2,
} from '../data/purchases/purchases-v2-repository';
import {
  buildFinancePaymentEvents,
  buildFinanceStoreRows,
  reimbursementTotals,
} from '../domain/finance-calculations';
import {
  buildFinanceOverviewRows,
  type FinanceOverviewStoreRow,
} from '../domain/finance-overview';
import type {
  FinanceReimbursement,
  FinanceReimbursementStatus,
  FinanceStorePurchaseRow,
  FinanceStoreRow,
} from '../domain/finance-types';
import type { PurchaseAttachmentV2, PurchaseV2 } from '../domain/purchase-v2-types';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { Store } from '../domain/types';
import type { FinanceStoreBudget, WorkService } from '../domain/works-types';
import './finance-page.css';

type FinanceTab = 'overview' | 'payments' | 'stores' | 'reimbursements';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferencia bancaria',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  cash: 'Dinheiro',
  invoiced: 'Faturado',
  other: 'Outro',
};

const REIMBURSEMENT_LABELS: Record<FinanceReimbursementStatus, string> = {
  draft: 'Rascunho',
  requested: 'Solicitado',
  approved: 'Aprovado',
  partial: 'Parcial',
  rejected: 'Recusado',
  received: 'Recebido',
  cancelled: 'Cancelado',
};

const DOCUMENT_LABELS: Record<string, string> = {
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  payment_proof: 'Comprovante',
  boleto: 'Boleto',
  purchase_order: 'Pedido',
  reimbursement: 'Reembolso',
  photo: 'Foto',
  other: 'Arquivo',
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatMonth(value: string): string {
  if (!value) return 'Todos os meses';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function decimalFromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function ReimbursementBadge({ status }: { status: FinanceReimbursementStatus }) {
  return (
    <span className={`finance-status finance-status--${status}`}>
      {REIMBURSEMENT_LABELS[status]}
    </span>
  );
}

function DocumentLinks({
  attachments,
  openingId,
  onOpen,
}: {
  attachments: PurchaseAttachmentV2[];
  openingId: string | null;
  onOpen: (attachment: PurchaseAttachmentV2) => Promise<void>;
}) {
  if (!attachments.length) return <span className="finance-muted">Sem anexo</span>;
  return (
    <div className="finance-documents">
      {attachments.map((attachment) => (
        <button
          type="button"
          key={attachment.id}
          disabled={openingId === attachment.id}
          onClick={() => void onOpen(attachment)}
          title={attachment.originalName}
        >
          <FileText size={14} />
          {openingId === attachment.id
            ? 'Abrindo...'
            : DOCUMENT_LABELS[attachment.documentType] || 'Arquivo'}
          <ExternalLink size={12} />
        </button>
      ))}
    </div>
  );
}

function reimbursementDocuments(
  reimbursement: FinanceReimbursement,
  purchases: PurchaseV2[],
): PurchaseAttachmentV2[] {
  const documents = new Map<string, PurchaseAttachmentV2>();
  reimbursement.items.forEach((item) => {
    const purchase = purchases.find((entry) => entry.id === item.purchaseId);
    purchase?.attachments.forEach((attachment) => {
      const matchesOrder = item.purchaseOrderId
        ? attachment.purchaseOrderId === item.purchaseOrderId || attachment.purchaseOrderId === null
        : attachment.purchaseOrderId === null;
      const matchesStore =
        attachment.stores.length === 0 ||
        attachment.stores.some((store) => store.storeId === reimbursement.storeId);
      if (matchesOrder && matchesStore) documents.set(attachment.id, attachment);
    });
  });
  return [...documents.values()];
}

function ReimbursementModal({
  candidate,
  reimbursement,
  storeRows,
  onClose,
  onSaved,
}: {
  candidate: FinanceStorePurchaseRow | null;
  reimbursement: FinanceReimbursement | null;
  storeRows: FinanceStoreRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const matchingRows = useMemo(() => {
    if (candidate) return [candidate];
    if (!reimbursement) return [];
    const store = storeRows.find((entry) => entry.storeId === reimbursement.storeId);
    return reimbursement.items.map(
      (item) =>
        store?.purchases.find(
          (purchase) =>
            purchase.purchaseId === item.purchaseId &&
            purchase.purchaseOrderId === item.purchaseOrderId,
        ) || null,
    );
  }, [candidate, reimbursement, storeRows]);
  const [status, setStatus] = useState<FinanceReimbursementStatus>(
    reimbursement?.status || 'requested',
  );
  const [protocol, setProtocol] = useState(reimbursement?.protocol || '');
  const [notes, setNotes] = useState(reimbursement?.notes || '');
  const [requestedAmounts, setRequestedAmounts] = useState(() =>
    reimbursement
      ? reimbursement.items.map((item) => item.requestedAmount)
      : candidate
        ? [decimalFromCents(candidate.availableCents)]
        : [],
  );
  const [approvedAmounts, setApprovedAmounts] = useState(() =>
    reimbursement ? reimbursement.items.map((item) => item.approvedAmount) : candidate ? ['0'] : [],
  );
  const [receivedAmounts, setReceivedAmounts] = useState(() =>
    reimbursement ? reimbursement.items.map((item) => item.receivedAmount) : candidate ? ['0'] : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeId = candidate?.storeId || reimbursement?.storeId || '';
  const store = storeRows.find((entry) => entry.storeId === storeId);

  const updateStatus = (nextStatus: FinanceReimbursementStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'approved') {
      setApprovedAmounts([...requestedAmounts]);
      setReceivedAmounts(requestedAmounts.map(() => '0'));
    } else if (nextStatus === 'rejected') {
      setApprovedAmounts(requestedAmounts.map(() => '0'));
      setReceivedAmounts(requestedAmounts.map(() => '0'));
    } else if (nextStatus === 'received') {
      const nextApproved = approvedAmounts.map((amount, index) =>
        moneyToCents(amount || '0') > 0n ? amount : requestedAmounts[index],
      );
      setApprovedAmounts(nextApproved);
      setReceivedAmounts(nextApproved);
    } else if (nextStatus !== 'partial') {
      setReceivedAmounts(requestedAmounts.map(() => '0'));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || matchingRows.some((row) => !row)) {
      setError('Nao foi possivel relacionar todas as compras deste reembolso.');
      return;
    }
    try {
      requestedAmounts.forEach((amount, index) => {
        const item = reimbursement?.items[index];
        const row = matchingRows[index];
        const eligibleCents = item ? moneyToCents(item.eligibleAmount) : row?.eligibleCents || 0n;
        const requestedCents = moneyToCents(amount);
        const approvedCents = moneyToCents(approvedAmounts[index] || '0');
        const receivedCents = moneyToCents(receivedAmounts[index] || '0');
        if (requestedCents <= 0n || requestedCents > eligibleCents)
          throw new Error('O valor solicitado deve respeitar o custo elegivel da loja.');
        if (approvedCents < 0n || approvedCents > requestedCents)
          throw new Error('O valor aprovado nao pode superar o solicitado.');
        if (receivedCents < 0n || receivedCents > approvedCents)
          throw new Error('O valor recebido nao pode superar o aprovado.');
      });
    } catch (validationError) {
      setError(errorMessage(validationError, 'Revise os valores do reembolso.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveFinanceReimbursement({
        id: reimbursement?.id || null,
        storeId,
        status,
        protocol,
        notes,
        items: matchingRows.map((row, index) => {
          const existingItem = reimbursement?.items[index];
          if (!row) throw new Error('Compra do reembolso nao encontrada.');
          return {
            purchaseId: existingItem?.purchaseId || row.purchaseId,
            purchaseOrderId: existingItem?.purchaseOrderId || row.purchaseOrderId,
            eligibleAmount: existingItem?.eligibleAmount || decimalFromCents(row.eligibleCents),
            requestedAmount: requestedAmounts[index],
            approvedAmount: approvedAmounts[index] || '0',
            receivedAmount: receivedAmounts[index] || '0',
            notes: existingItem?.notes || '',
          };
        }),
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Nao foi possivel salvar o reembolso.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(candidate || reimbursement)}
      title={reimbursement ? `Reembolso ${reimbursement.code}` : 'Novo reembolso'}
      description={
        store ? `${store.code} · ${store.name} · ${store.city}/${store.state}` : undefined
      }
      onClose={onClose}
      className="finance-reimbursement-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid form-grid--three">
          <label className="field">
            Situacao
            <select
              value={status}
              onChange={(event) => updateStatus(event.target.value as FinanceReimbursementStatus)}
            >
              {Object.entries(REIMBURSEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Protocolo / referencia
            <input
              value={protocol}
              onChange={(event) => setProtocol(event.target.value)}
              placeholder="Ex.: protocolo do banco"
            />
          </label>
        </div>

        <section className="finance-reimbursement-lines">
          <header>
            <strong>Compras desta solicitacao</strong>
            <span>O custo elegivel fica congelado para auditoria.</span>
          </header>
          {matchingRows.map((row, index) => {
            const existingItem = reimbursement?.items[index];
            const eligibleCents = existingItem
              ? moneyToCents(existingItem.eligibleAmount)
              : row?.eligibleCents || 0n;
            return (
              <article key={existingItem?.id || row?.id || index}>
                <div>
                  <strong>{existingItem?.purchaseCode || row?.purchaseCode || 'Compra'}</strong>
                  <span>
                    {existingItem?.supplierName || row?.supplierName || 'Fornecedor'} ·{' '}
                    {row?.itemSummary || 'Itens da compra'}
                  </span>
                  <small>Custo elegivel: {formatBRL(eligibleCents)}</small>
                </div>
                <label className="field">
                  Solicitado
                  <input
                    value={requestedAmounts[index] || ''}
                    onChange={(event) =>
                      setRequestedAmounts((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index ? event.target.value : value,
                        ),
                      )
                    }
                  />
                </label>
                {['approved', 'partial', 'received'].includes(status) && (
                  <label className="field">
                    Aprovado
                    <input
                      value={approvedAmounts[index] || ''}
                      onChange={(event) =>
                        setApprovedAmounts((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                {status === 'received' && (
                  <label className="field">
                    Recebido
                    <input
                      value={receivedAmounts[index] || ''}
                      onChange={(event) =>
                        setReceivedAmounts((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                  </label>
                )}
              </article>
            );
          })}
        </section>

        <label className="field">
          Observacoes
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Pendencias, glosas ou orientacoes para acompanhamento"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar reembolso'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FinanceBudgetModal({
  row,
  onClose,
  onSaved,
}: {
  row: FinanceOverviewStoreRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(decimalFromCents(row.budgetBbCents));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (moneyToCents(amount || '0') < 0n) {
      setError('A verba não pode ser negativa.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveFinanceStoreBudget(row.storeId, amount || '0', notes);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar a verba da loja.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Verba BB da loja"
      description={`${row.code} · ${row.name} · ${row.city}/${row.state}`}
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Verba / teto BB
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
          />
        </label>
        <label className="field">
          Observação
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar verba'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function FinancePage() {
  const { can } = useSession();
  const canManage = can('finance.manage');
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [reimbursements, setReimbursements] = useState<FinanceReimbursement[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [budgets, setBudgets] = useState<FinanceStoreBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [stateFilter, setStateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [overviewExporting, setOverviewExporting] = useState<'pdf' | 'excel' | null>(null);
  const [budgetStore, setBudgetStore] = useState<FinanceOverviewStoreRow | null>(null);
  const [candidate, setCandidate] = useState<FinanceStorePurchaseRow | null>(null);
  const [editingReimbursement, setEditingReimbursement] = useState<FinanceReimbursement | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPurchases, nextReimbursements, nextStores, nextWorks, nextBudgets] =
        await Promise.all([
          listSupplyPurchasesV2(),
          listFinanceReimbursements(),
          listStores(),
          listWorkServices(),
          listFinanceStoreBudgets(),
        ]);
      setPurchases(nextPurchases);
      setReimbursements(nextReimbursements);
      setStores(nextStores);
      setWorks(nextWorks);
      setBudgets(nextBudgets);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Nao foi possivel carregar o Financeiro.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const paymentEvents = useMemo(() => buildFinancePaymentEvents(purchases), [purchases]);
  const storeRows = useMemo(
    () => buildFinanceStoreRows(purchases, reimbursements),
    [purchases, reimbursements],
  );
  const states = useMemo(
    () => [...new Set(stores.map((store) => store.state))].sort(),
    [stores],
  );
  const overviewRows = useMemo(
    () =>
      buildFinanceOverviewRows({
        stores,
        purchases,
        purchaseStoreRows: storeRows,
        works,
        budgets,
      }),
    [budgets, purchases, storeRows, stores, works],
  );
  const search = normalized(query);
  const allowedStoreIds = useMemo(
    () =>
      new Set(
        stores
          .filter((store) => !stateFilter || store.state === stateFilter)
          .filter((store) => !storeFilter || store.id === storeFilter)
          .map((store) => store.id),
      ),
    [stateFilter, storeFilter, stores],
  );

  const filteredOverview = useMemo(
    () =>
      overviewRows
        .filter((store) => allowedStoreIds.has(store.storeId))
        .filter(
          (store) =>
            !search ||
            normalized([store.code, store.name, store.city, store.state].join(' ')).includes(search),
        ),
    [allowedStoreIds, overviewRows, search],
  );

  const overviewKpis = useMemo(
    () =>
      filteredOverview.reduce(
        (totals, row) => {
          totals.budgetBbCents += row.budgetBbCents;
          totals.budgetTotalCents += row.budgetTotalCents;
          totals.realizedCents += row.realizedTotalCents;
          totals.differenceCents += row.differenceCents;
          totals.paidCents += row.paidCents;
          totals.payableCents += row.payableCents;
          return totals;
        },
        {
          budgetBbCents: 0n,
          budgetTotalCents: 0n,
          realizedCents: 0n,
          differenceCents: 0n,
          paidCents: 0n,
          payableCents: 0n,
        },
      ),
    [filteredOverview],
  );

  const filteredPayments = useMemo(
    () =>
      paymentEvents
        .filter((event) => !month || event.month === month)
        .filter((event) => !stateFilter || event.states.includes(stateFilter))
        .filter((event) => !storeFilter || event.storeIds.includes(storeFilter))
        .filter(
          (event) =>
            !search ||
            normalized(
              [
                event.purchaseCode,
                event.quoteCode,
                event.supplierName,
                event.itemSummary,
                event.sourceLabel || '',
              ].join(' '),
            ).includes(search),
        ),
    [month, paymentEvents, search, stateFilter, storeFilter],
  );

  const filteredStores = useMemo(
    () =>
      storeRows
        .filter((store) => allowedStoreIds.has(store.storeId))
        .filter(
          (store) =>
            !search ||
            normalized(
              [
                store.code,
                store.name,
                store.city,
                store.state,
                ...store.purchases.flatMap((purchase) => [
                  purchase.purchaseCode,
                  purchase.supplierName,
                  purchase.itemSummary,
                ]),
              ].join(' '),
            ).includes(search),
        ),
    [allowedStoreIds, search, storeRows],
  );

  const filteredReimbursements = useMemo(
    () =>
      reimbursements
        .filter((reimbursement) => allowedStoreIds.has(reimbursement.storeId))
        .filter(
          (reimbursement) =>
            !search ||
            normalized(
              [
                reimbursement.code,
                reimbursement.storeCode,
                reimbursement.storeName,
                reimbursement.protocol || '',
                ...reimbursement.items.flatMap((item) => [item.purchaseCode, item.supplierName]),
              ].join(' '),
            ).includes(search),
        ),
    [allowedStoreIds, reimbursements, search],
  );

  const kpis = useMemo(() => {
    const paidCents = filteredPayments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountCents, 0n);
    const plannedCents = filteredPayments
      .filter((payment) => payment.status === 'planned')
      .reduce((sum, payment) => sum + payment.amountCents, 0n);
    const realizedCents = filteredStores.reduce((sum, store) => sum + store.realizedCents, 0n);
    const availableCents = filteredStores.reduce((sum, store) => sum + store.availableCents, 0n);
    const requestedCents = filteredReimbursements
      .filter((reimbursement) => !['rejected', 'cancelled'].includes(reimbursement.status))
      .reduce((sum, reimbursement) => sum + reimbursementTotals(reimbursement).requestedCents, 0n);
    const receivedCents = filteredReimbursements.reduce(
      (sum, reimbursement) => sum + reimbursementTotals(reimbursement).receivedCents,
      0n,
    );
    return {
      paidCents,
      plannedCents,
      realizedCents,
      availableCents,
      requestedCents,
      receivedCents,
    };
  }, [filteredPayments, filteredReimbursements, filteredStores]);

  const openAttachment = async (attachment: PurchaseAttachmentV2) => {
    setOpeningId(attachment.id);
    setError(null);
    try {
      window.open(
        await createPurchaseAttachmentSignedUrlV2(attachment.storagePath),
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      setError('Nao foi possivel abrir o documento.');
    } finally {
      setOpeningId(null);
    }
  };

  const overviewFiltersText = useMemo(() => {
    const parts: string[] = [];
    if (query.trim()) parts.push(`Busca: ${query.trim()}`);
    if (stateFilter) parts.push(`UF: ${stateFilter}`);
    if (storeFilter) {
      const selectedStore = stores.find((store) => store.id === storeFilter);
      if (selectedStore) parts.push(`Loja: ${selectedStore.code} · ${selectedStore.name}`);
    }
    return parts.length ? parts.join(' | ') : 'Todas as lojas';
  }, [query, stateFilter, storeFilter, stores]);

  const exportOverview = async (format: 'pdf' | 'excel') => {
    setOverviewExporting(format);
    setError(null);
    try {
      const input = {
        rows: filteredOverview,
        generatedAt: new Date(),
        filtersText: overviewFiltersText,
      };
      if (format === 'pdf') await downloadFinanceOverviewPdf(input);
      else await downloadFinanceOverviewExcel(input);
    } catch (exportError) {
      setError(errorMessage(exportError, 'Não foi possível gerar a exportação da Visão Geral.'));
    } finally {
      setOverviewExporting(null);
    }
  };

  const storesByState = useMemo(() => {
    const grouped = new Map<string, FinanceStoreRow[]>();
    filteredStores.forEach((store) =>
      grouped.set(store.state, [...(grouped.get(store.state) || []), store]),
    );
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [filteredStores]);

  return (
    <div className="page-stack finance-page">
      <header className="page-heading finance-heading">
        <div>
          <span className="eyebrow">Financeiro</span>
          <h2>Visão geral, pagamentos, custos e reembolsos</h2>
          <p>
            Consolide orçamento x realizado de itens e obras, fluxo de pagamentos e reembolsos por
            loja.
          </p>
        </div>
        <button className="button button--secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={17} className={loading ? 'spin' : undefined} /> Atualizar
        </button>
      </header>

      {tab === 'overview' ? (
        <section
          className="finance-kpis finance-kpis--grouped"
          aria-label="Resumo executivo financeiro"
        >
          <div className="finance-kpi-group finance-kpi-group--budget">
            <span className="finance-kpi-group__title">Planejamento / Orçamento</span>
            <div>
              <article>
                <Landmark size={21} />
                <span>Verba BB</span>
                <strong>{formatBRL(overviewKpis.budgetBbCents)}</strong>
              </article>
              <article>
                <ReceiptText size={21} />
                <span>Orçado total</span>
                <strong>{formatBRL(overviewKpis.budgetTotalCents)}</strong>
              </article>
            </div>
          </div>
          <div className="finance-kpi-group finance-kpi-group--execution">
            <span className="finance-kpi-group__title">Execução</span>
            <div>
              <article className="finance-kpi finance-kpi--primary">
                <Building2 size={21} />
                <span>Realizado total</span>
                <strong>{formatBRL(overviewKpis.realizedCents)}</strong>
              </article>
              <article className={overviewKpis.differenceCents < 0n ? 'finance-kpi--negative' : ''}>
                <CheckCircle2 size={21} />
                <span>Diferença orçamento</span>
                <strong>{formatBRL(overviewKpis.differenceCents)}</strong>
              </article>
            </div>
          </div>
          <div className="finance-kpi-group finance-kpi-group--cash">
            <span className="finance-kpi-group__title">Pagamentos / Financeiro</span>
            <div>
              <article>
                <WalletCards size={21} />
                <span>Pago</span>
                <strong>{formatBRL(overviewKpis.paidCents)}</strong>
              </article>
              <article>
                <CalendarDays size={21} />
                <span>Saldo a pagar</span>
                <strong>{formatBRL(overviewKpis.payableCents)}</strong>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <section className="finance-kpis" aria-label="Resumo financeiro">
          <article className="finance-kpi finance-kpi--primary">
            <CheckCircle2 size={21} />
            <span>Pago em {formatMonth(month)}</span>
            <strong>{formatBRL(kpis.paidCents)}</strong>
          </article>
          <article>
            <CalendarDays size={21} />
            <span>A pagar em {formatMonth(month)}</span>
            <strong>{formatBRL(kpis.plannedCents)}</strong>
          </article>
          <article>
            <WalletCards size={21} />
            <span>Custo realizado</span>
            <strong>{formatBRL(kpis.realizedCents)}</strong>
          </article>
          <article>
            <Landmark size={21} />
            <span>Disponivel para solicitar</span>
            <strong>{formatBRL(kpis.availableCents)}</strong>
          </article>
          <article>
            <ReceiptText size={21} />
            <span>Reembolso solicitado</span>
            <strong>{formatBRL(kpis.requestedCents)}</strong>
          </article>
          <article>
            <BanknoteArrowDown size={21} />
            <span>Reembolso recebido</span>
            <strong>{formatBRL(kpis.receivedCents)}</strong>
          </article>
        </section>
      )}

      <section className="finance-controls">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar compra, item, fornecedor, loja ou protocolo"
          />
        </label>
        {tab === 'payments' && (
          <label className="finance-filter">
            Mês
            <input
              aria-label="Mes financeiro"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        )}
        <label className="finance-filter">
          UF
          <select
            aria-label="Filtrar por UF"
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value);
              setStoreFilter('');
            }}
          >
            <option value="">Todas as UFs</option>
            {states.map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
        <label className="finance-filter">
          Loja
          <select
            aria-label="Filtrar por loja"
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value)}
          >
            <option value="">Todas as lojas</option>
            {stores
              .filter((store) => !stateFilter || store.state === stateFilter)
              .map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} · {store.name}
                </option>
              ))}
          </select>
        </label>
      </section>

      <div className="finance-tabs" role="tablist" aria-label="Visoes do Financeiro">
        <button
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? 'is-active' : ''}
          onClick={() => setTab('overview')}
        >
          <Building2 size={18} />
          Visão Geral
        </button>
        <button
          role="tab"
          aria-selected={tab === 'payments'}
          className={tab === 'payments' ? 'is-active' : ''}
          onClick={() => setTab('payments')}
        >
          <WalletCards size={18} />
          Pagamentos
        </button>
        <button
          role="tab"
          aria-selected={tab === 'stores'}
          className={tab === 'stores' ? 'is-active' : ''}
          onClick={() => setTab('stores')}
        >
          <MapPinned size={18} />
          Lojas e UFs
        </button>
        <button
          role="tab"
          aria-selected={tab === 'reimbursements'}
          className={tab === 'reimbursements' ? 'is-active' : ''}
          onClick={() => setTab('reimbursements')}
        >
          <Landmark size={18} />
          Reembolsos
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? (
        <InlineLoading label="Carregando Financeiro" />
      ) : (
        <>
          {tab === 'overview' && (
            <section className="finance-panel">
              <header className="finance-panel__heading">
                <div>
                  <h3>Orçamento x realizado por loja</h3>
                  <p>
                    Itens e obras permanecem em módulos separados, mas são consolidados nesta visão.
                  </p>
                </div>
                <div className="finance-panel__tools">
                  <span>{filteredOverview.length} lojas</span>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={Boolean(overviewExporting) || !filteredOverview.length}
                    onClick={() => void exportOverview('pdf')}
                  >
                    <FileText size={15} />
                    {overviewExporting === 'pdf' ? 'Gerando...' : 'PDF'}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={Boolean(overviewExporting) || !filteredOverview.length}
                    onClick={() => void exportOverview('excel')}
                  >
                    <FileSpreadsheet size={15} />
                    {overviewExporting === 'excel' ? 'Gerando...' : 'Excel'}
                  </button>
                </div>
              </header>
              {filteredOverview.length ? (
                <div className="finance-table-scroll">
                  <table className="finance-table finance-overview-table">
                    <thead>
                      <tr className="finance-overview-groups">
                        <th rowSpan={2}>Loja</th>
                        <th colSpan={4}>Orçamento</th>
                        <th colSpan={4}>Realização</th>
                        <th colSpan={2}>Financeiro</th>
                        <th colSpan={1}>Documentação</th>
                      </tr>
                      <tr>
                        <th>Verba BB</th>
                        <th>Orçado itens</th>
                        <th>Orçado obra</th>
                        <th>Orçado total</th>
                        <th>Comprado itens</th>
                        <th>Obra contratada</th>
                        <th>Realizado</th>
                        <th>Diferença</th>
                        <th>Pago</th>
                        <th>Saldo a pagar</th>
                        <th>Obra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOverview.map((row) => (
                        <tr key={row.storeId}>
                          <td className="finance-overview-store">
                            <strong>{row.code}</strong>
                            <span>{row.name}</span>
                            <small>{row.city}/{row.state}</small>
                            <Link
                              to={`/financeiro/lojas/${row.storeId}`}
                              className="button button--secondary button--small finance-overview-details"
                            >
                              Abrir detalhes
                              <ExternalLink size={12} />
                            </Link>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.budgetBbCents)}</strong>
                            {canManage && (
                              <button
                                type="button"
                                className="finance-budget-edit"
                                onClick={() => setBudgetStore(row)}
                              >
                                Editar verba
                              </button>
                            )}
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.itemsBudgetCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.worksBudgetCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.budgetTotalCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.itemsRealizedCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.worksContractedCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.realizedTotalCents)}</strong>
                          </td>
                          <td>
                            <strong className={row.differenceCents < 0n ? 'finance-difference--negative' : 'finance-difference--positive'}>
                              {formatBRL(row.differenceCents)}
                            </strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.paidCents)}</strong>
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(row.payableCents)}</strong>
                          </td>
                          <td>
                            <span className={`finance-document-state finance-document-state--${row.documentationStatus}`}>
                              {row.documentationStatus === 'complete'
                                ? 'Completa'
                                : row.documentationStatus === 'partial'
                                  ? 'Parcial'
                                  : row.documentationStatus === 'pending'
                                    ? 'Pendente'
                                    : 'Sem obra'}
                            </span>
                            {row.worksMissingDocumentsCents > 0n && (
                              <small>{formatBRL(row.worksMissingDocumentsCents)} sem documento</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Nenhuma loja encontrada"
                  detail="Ajuste os filtros para consultar outra unidade."
                />
              )}
            </section>
          )}

          {tab === 'payments' && (
            <section className="finance-panel">
              <header className="finance-panel__heading">
                <div>
                  <h3>Pagamentos de {formatMonth(month)}</h3>
                  <p>
                    Realizados pela data efetiva; previstos parcelados a partir do primeiro
                    vencimento.
                  </p>
                </div>
                <span>{filteredPayments.length} lancamentos</span>
              </header>
              {filteredPayments.length ? (
                <div className="finance-table-scroll">
                  <table className="finance-table finance-payments-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Situacao</th>
                        <th>Compra / fornecedor</th>
                        <th>Itens</th>
                        <th>Forma</th>
                        <th>Lojas / UF</th>
                        <th>Valor</th>
                        <th>Comprovantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{formatDate(payment.date)}</strong>
                            <small>{payment.installmentLabel}</small>
                          </td>
                          <td>
                            <span
                              className={`finance-payment-state finance-payment-state--${payment.status}`}
                            >
                              {payment.status === 'paid' ? 'Realizado' : 'A realizar'}
                            </span>
                          </td>
                          <td>
                            <strong>{payment.purchaseCode}</strong>
                            <span>{payment.supplierName}</span>
                            <small>{payment.quoteCode}</small>
                          </td>
                          <td>
                            <span>{payment.itemSummary}</span>
                          </td>
                          <td>
                            <strong>
                              {PAYMENT_LABELS[payment.paymentMethod] || payment.paymentMethod}
                            </strong>
                            <small>{payment.sourceLabel || 'Origem nao informada'}</small>
                          </td>
                          <td>
                            {payment.allocationStatus === 'assigned' ? (
                              <>
                                <strong>{payment.storeIds.length} loja(s)</strong>
                                <span>{payment.states.join(', ') || '—'}</span>
                              </>
                            ) : payment.allocationStatus === 'pending_distribution' ? (
                              <>
                                <strong>Distribuicao pendente</strong>
                                <span>Pedido vinculado; confirme as lojas</span>
                              </>
                            ) : (
                              <>
                                <strong>Sem vinculo com pedido</strong>
                                <span>Distribuicao por loja indisponivel</span>
                              </>
                            )}
                          </td>
                          <td className="finance-money">
                            <strong>{formatBRL(payment.amountCents)}</strong>
                          </td>
                          <td>
                            <DocumentLinks
                              attachments={payment.attachments}
                              openingId={openingId}
                              onOpen={openAttachment}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Nenhum pagamento neste periodo"
                  detail="Altere o mes ou os filtros para consultar outros lancamentos."
                />
              )}
            </section>
          )}

          {tab === 'stores' && (
            <section className="finance-panel">
              <header className="finance-panel__heading">
                <div>
                  <h3>Custo por Loja e UF</h3>
                  <p>Expanda uma loja para ver compras, itens, quantidades, pagamentos e anexos.</p>
                </div>
                <span>{filteredStores.length} lojas</span>
              </header>
              {storesByState.length ? (
                storesByState.map(([state, stores]) => (
                  <section className="finance-state-group" key={state}>
                    <header>
                      <MapPinned size={17} />
                      <strong>{state}</strong>
                      <span>
                        {stores.length} loja(s) ·{' '}
                        {formatBRL(stores.reduce((sum, store) => sum + store.realizedCents, 0n))}
                      </span>
                    </header>
                    {stores.map((store) => (
                      <details className="finance-store-card" key={store.storeId}>
                        <summary>
                          <div className="finance-store-identity">
                            <span>{store.code}</span>
                            <strong>{store.name}</strong>
                            <small>
                              {store.city}/{store.state}
                            </small>
                          </div>
                          <div>
                            <span>Custo realizado</span>
                            <strong>{formatBRL(store.realizedCents)}</strong>
                          </div>
                          <div>
                            <span>Pago / previsto</span>
                            <strong>{formatBRL(store.paidCents)}</strong>
                            <small>{formatBRL(store.plannedCents)} previsto</small>
                          </div>
                          <div>
                            <span>Disponivel p/ solicitar</span>
                            <strong>{formatBRL(store.availableCents)}</strong>
                            <small>{formatBRL(store.receivedCents)} recebido</small>
                          </div>
                          <ChevronDown size={18} />
                        </summary>
                        <div className="finance-store-purchases">
                          {store.purchases.map((purchase) => (
                            <article key={purchase.id}>
                              <div className="finance-store-purchase__identity">
                                <strong>{purchase.purchaseCode}</strong>
                                <span>{purchase.supplierName}</span>
                                <small>
                                  {formatDate(purchase.purchasedOn)} ·{' '}
                                  {purchase.supplierOrderRef || 'Sem referencia do pedido'}
                                </small>
                              </div>
                              <div>
                                <span>Itens e quantidades</span>
                                <strong>{purchase.itemSummary}</strong>
                                <small>{purchase.quantityLabel}</small>
                              </div>
                              <div>
                                <span>Custo da loja</span>
                                <strong>{formatBRL(purchase.realizedCents)}</strong>
                                <small>
                                  {formatBRL(purchase.paidCents)} pago ·{' '}
                                  {formatBRL(purchase.plannedCents)} previsto
                                </small>
                              </div>
                              <div>
                                <span>Reembolso</span>
                                <strong>{formatBRL(purchase.requestedCents)} solicitado</strong>
                                <small>{formatBRL(purchase.receivedCents)} recebido</small>
                              </div>
                              <DocumentLinks
                                attachments={purchase.attachments}
                                openingId={openingId}
                                onOpen={openAttachment}
                              />
                              <div className="finance-store-purchase__actions">
                                {canManage && purchase.availableCents > 0n && (
                                  <button
                                    type="button"
                                    className="button button--primary button--small"
                                    onClick={() => setCandidate(purchase)}
                                  >
                                    <Plus size={15} />
                                    Solicitar reembolso
                                  </button>
                                )}
                                <Link
                                  className="button button--secondary button--small"
                                  to="/suprimentos/compras"
                                >
                                  <ExternalLink size={15} />
                                  Ver compra
                                </Link>
                              </div>
                            </article>
                          ))}
                        </div>
                      </details>
                    ))}
                  </section>
                ))
              ) : (
                <EmptyState
                  title="Nenhuma loja encontrada"
                  detail="Ajuste os filtros ou confirme a distribuicao das compras por loja."
                />
              )}
            </section>
          )}

          {tab === 'reimbursements' && (
            <section className="finance-panel">
              <header className="finance-panel__heading">
                <div>
                  <h3>Reembolsos por compra</h3>
                  <p>
                    Acompanhe solicitado, aprovado e recebido sem perder o vinculo com a loja e os
                    comprovantes.
                  </p>
                </div>
                <span>{filteredReimbursements.length} solicitacoes</span>
              </header>
              {filteredReimbursements.length ? (
                <div className="finance-reimbursement-list">
                  {filteredReimbursements.map((reimbursement) => {
                    const totals = reimbursementTotals(reimbursement);
                    const documents = reimbursementDocuments(reimbursement, purchases);
                    return (
                      <article key={reimbursement.id}>
                        <header>
                          <div>
                            <span>{reimbursement.code}</span>
                            <strong>
                              {reimbursement.storeCode} · {reimbursement.storeName}
                            </strong>
                            <small>
                              {reimbursement.storeCity}/{reimbursement.storeState}
                            </small>
                          </div>
                          <ReimbursementBadge status={reimbursement.status} />
                          <div>
                            <span>Solicitado</span>
                            <strong>{formatBRL(totals.requestedCents)}</strong>
                            <small>{formatDate(reimbursement.requestedAt)}</small>
                          </div>
                          <div>
                            <span>Aprovado</span>
                            <strong>{formatBRL(totals.approvedCents)}</strong>
                            <small>{reimbursement.protocol || 'Sem protocolo'}</small>
                          </div>
                          <div>
                            <span>Recebido</span>
                            <strong>{formatBRL(totals.receivedCents)}</strong>
                            <small>{formatDate(reimbursement.receivedAt)}</small>
                          </div>
                          {canManage && (
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={() => setEditingReimbursement(reimbursement)}
                            >
                              <Pencil size={15} />
                              Atualizar
                            </button>
                          )}
                        </header>
                        <div className="finance-reimbursement-purchases">
                          {reimbursement.items.map((item) => (
                            <div key={item.id}>
                              <strong>{item.purchaseCode}</strong>
                              <span>{item.supplierName}</span>
                              <small>
                                {formatBRL(moneyToCents(item.requestedAmount))} solicitado ·{' '}
                                {formatBRL(moneyToCents(item.approvedAmount))} aprovado
                              </small>
                            </div>
                          ))}
                          <DocumentLinks
                            attachments={documents}
                            openingId={openingId}
                            onOpen={openAttachment}
                          />
                        </div>
                        {reimbursement.notes && <p>{reimbursement.notes}</p>}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Nenhum reembolso registrado"
                  detail="Na aba Lojas e UFs, abra uma compra paga para iniciar a solicitacao."
                />
              )}
            </section>
          )}
        </>
      )}

      <footer className="finance-note">
        <Building2 size={18} />
        <span>
          A Visão Geral consolida os itens de Compras e os contratos de Obras e Serviços. O custo
          por loja continua usando o rateio confirmado em Compras; documentos e pagamentos de obra
          são controlados separadamente no novo módulo.
        </span>
      </footer>

      {budgetStore && (
        <FinanceBudgetModal
          key={budgetStore.storeId}
          row={budgetStore}
          onClose={() => setBudgetStore(null)}
          onSaved={load}
        />
      )}

      <ReimbursementModal
        key={candidate?.id || editingReimbursement?.id || 'closed'}
        candidate={candidate}
        reimbursement={editingReimbursement}
        storeRows={storeRows}
        onClose={() => {
          setCandidate(null);
          setEditingReimbursement(null);
        }}
        onSaved={load}
      />
    </div>
  );
}
