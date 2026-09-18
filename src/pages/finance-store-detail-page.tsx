import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  HardHat,
  Landmark,
  ReceiptText,
  Search,
  ShoppingCart,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, InlineLoading } from '../components/ui';
import {
  downloadFinanceStoreDetailExcel,
  downloadFinanceStoreDetailPdf,
} from '../data/exports/finance-exports';
import { buildFinanceStoreRows } from '../domain/finance-calculations';
import {
  buildFinanceOverviewRows,
  buildFinanceStoreItemRows,
  type FinanceOverviewStoreRow,
} from '../domain/finance-overview';
import { formatQuantityV2 } from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { FinanceStoreBudget, WorkService } from '../domain/works-types';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  listFinanceStoreBudgets,
  listWorkServices,
} from '../data/works/works-repository';
import './finance-store-detail-page.css';

const WORK_STATUS_LABELS: Record<WorkService['status'], string> = {
  budget: 'Orçamento',
  awaiting_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  contracted: 'Contratado',
  in_progress: 'Em execução',
  paused: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const ITEM_STATUS_LABELS = {
  not_purchased: 'Não comprado',
  partial: 'Compra parcial',
  purchased: 'Comprado',
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function quantityLabel(value: bigint, unit: string): string {
  return `${formatQuantityV2((Number(value) / 1000).toFixed(3))} ${unit}`;
}

function workTotals(work: WorkService) {
  const budgetCents = moneyToCents(work.budgetAmount);
  const contractedCents = moneyToCents(work.contractedAmount);
  const paidCents = work.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const documentedCents = work.documents.reduce(
    (sum, document) =>
      sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
    0n,
  );

  return {
    budgetCents,
    contractedCents,
    differenceCents: budgetCents - contractedCents,
    paidCents,
    payableCents: contractedCents > paidCents ? contractedCents - paidCents : 0n,
    documentedCents,
    missingDocumentsCents:
      contractedCents > documentedCents ? contractedCents - documentedCents : 0n,
  };
}

export function FinanceStoreDetailPage() {
  const { storeId } = useParams();
  const [stores, setStores] = useState<Store[]>([]);
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [budgets, setBudgets] = useState<FinanceStoreBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [itemStatusFilter, setItemStatusFilter] = useState('');
  const [workStatusFilter, setWorkStatusFilter] = useState('');
  const [workCategoryFilter, setWorkCategoryFilter] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStores, nextPurchases, nextWorks, nextBudgets] = await Promise.all([
        listStores(),
        listSupplyPurchasesV2(),
        listWorkServices(),
        listFinanceStoreBudgets(),
      ]);
      setStores(nextStores);
      setPurchases(nextPurchases);
      setWorks(nextWorks);
      setBudgets(nextBudgets);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Não foi possível carregar o detalhe da loja.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const store = useMemo(() => stores.find((entry) => entry.id === storeId) || null, [storeId, stores]);
  const purchaseStoreRows = useMemo(() => buildFinanceStoreRows(purchases, []), [purchases]);
  const overview = useMemo<FinanceOverviewStoreRow | null>(() => {
    if (!store) return null;
    return (
      buildFinanceOverviewRows({
        stores: [store],
        purchases,
        purchaseStoreRows,
        works,
        budgets,
      })[0] || null
    );
  }, [budgets, purchaseStoreRows, purchases, store, works]);
  const itemRows = useMemo(
    () => (storeId ? buildFinanceStoreItemRows(purchases, storeId) : []),
    [purchases, storeId],
  );
  const storeWorks = useMemo(
    () =>
      works
        .filter((work) => work.storeId === storeId && work.status !== 'cancelled')
        .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR')),
    [storeId, works],
  );
  const workCategories = useMemo(
    () => [...new Set(storeWorks.map((work) => work.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [storeWorks],
  );
  const detailSearch = normalized(query);
  const filteredItemRows = useMemo(
    () =>
      itemRows
        .filter((row) => !itemStatusFilter || row.purchaseStatus === itemStatusFilter)
        .filter(
          (row) =>
            !detailSearch ||
            normalized(
              [
                row.itemCode,
                row.itemName,
                row.purchaseCode,
                row.quoteCode,
                row.supplierName,
              ].join(' '),
            ).includes(detailSearch),
        ),
    [detailSearch, itemRows, itemStatusFilter],
  );
  const filteredStoreWorks = useMemo(
    () =>
      storeWorks
        .filter((work) => !workStatusFilter || work.status === workStatusFilter)
        .filter((work) => !workCategoryFilter || work.category === workCategoryFilter)
        .filter(
          (work) =>
            !detailSearch ||
            normalized(
              [work.code, work.category, work.description, work.providerName || ''].join(' '),
            ).includes(detailSearch),
        ),
    [detailSearch, storeWorks, workCategoryFilter, workStatusFilter],
  );
  const filtersText = useMemo(() => {
    const parts: string[] = [];
    if (query.trim()) parts.push(`Busca: ${query.trim()}`);
    if (itemStatusFilter)
      parts.push(`Itens: ${ITEM_STATUS_LABELS[itemStatusFilter as keyof typeof ITEM_STATUS_LABELS]}`);
    if (workStatusFilter)
      parts.push(`Obras: ${WORK_STATUS_LABELS[workStatusFilter as WorkService['status']]}`);
    if (workCategoryFilter) parts.push(`Categoria: ${workCategoryFilter}`);
    return parts.length ? parts.join(' | ') : 'Sem filtros';
  }, [itemStatusFilter, query, workCategoryFilter, workStatusFilter]);

  const exportDetail = async (format: 'pdf' | 'excel') => {
    if (!store || !overview) return;
    setExporting(format);
    setError(null);
    try {
      const input = {
        store,
        overview,
        items: filteredItemRows,
        works: filteredStoreWorks,
        generatedAt: new Date(),
        filtersText,
      };
      if (format === 'pdf') await downloadFinanceStoreDetailPdf(input);
      else await downloadFinanceStoreDetailExcel(input);
    } catch (exportError) {
      setError(errorMessage(exportError, 'Não foi possível gerar a exportação da loja.'));
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <InlineLoading label="Carregando detalhe financeiro da loja" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!store || !overview) {
    return (
      <EmptyState
        title="Loja não encontrada"
        detail="Volte à Visão Geral e selecione uma loja disponível."
      />
    );
  }

  return (
    <div className="page-stack finance-store-detail">
      <header className="finance-store-detail__heading">
        <div>
          <Link to="/financeiro" className="finance-store-detail__back">
            <ArrowLeft size={16} />
            Voltar para Visão Geral
          </Link>
          <span className="eyebrow">Financeiro · Detalhe da loja</span>
          <h2>{store.code} · {store.name}</h2>
          <p>{store.city}/{store.state}</p>
        </div>
        <div className="finance-store-detail__actions">
          <button
            type="button"
            className="button button--secondary button--small"
            disabled={Boolean(exporting)}
            onClick={() => void exportDetail('pdf')}
          >
            <FileText size={15} />
            {exporting === 'pdf' ? 'Gerando...' : 'PDF'}
          </button>
          <button
            type="button"
            className="button button--secondary button--small"
            disabled={Boolean(exporting)}
            onClick={() => void exportDetail('excel')}
          >
            <FileSpreadsheet size={15} />
            {exporting === 'excel' ? 'Gerando...' : 'Excel'}
          </button>
        </div>
      </header>

      <section className="finance-store-detail__kpis" aria-label="Resumo da loja">
        <article>
          <Landmark size={20} />
          <span>Verba BB</span>
          <strong>{formatBRL(overview.budgetBbCents)}</strong>
        </article>
        <article>
          <ReceiptText size={20} />
          <span>Orçado total</span>
          <strong>{formatBRL(overview.budgetTotalCents)}</strong>
        </article>
        <article className="is-primary">
          <Building2 size={20} />
          <span>Realizado</span>
          <strong>{formatBRL(overview.realizedTotalCents)}</strong>
        </article>
        <article className={overview.differenceCents < 0n ? 'is-negative' : 'is-positive'}>
          <CheckCircle2 size={20} />
          <span>Diferença</span>
          <strong>{formatBRL(overview.differenceCents)}</strong>
        </article>
        <article>
          <WalletCards size={20} />
          <span>Pago</span>
          <strong>{formatBRL(overview.paidCents)}</strong>
        </article>
        <article>
          <WalletCards size={20} />
          <span>A pagar</span>
          <strong>{formatBRL(overview.payableCents)}</strong>
        </article>
      </section>

      <section className="finance-store-detail__group-summary">
        <header>
          <div>
            <h3>Composição do orçamento</h3>
            <p>Itens e obras são cadastrados separadamente e consolidados nesta loja.</p>
          </div>
        </header>
        <div className="finance-store-detail__group-grid">
          <article>
            <ShoppingCart size={19} />
            <strong>Itens / equipamentos / mobiliário</strong>
            <span>Orçado {formatBRL(overview.itemsBudgetCents)}</span>
            <span>Comprado {formatBRL(overview.itemsRealizedCents)}</span>
            <b>{formatBRL(overview.itemsBudgetCents - overview.itemsRealizedCents)} de diferença atual</b>
          </article>
          <article>
            <HardHat size={19} />
            <strong>Obras e Serviços</strong>
            <span>Orçado {formatBRL(overview.worksBudgetCents)}</span>
            <span>Contratado {formatBRL(overview.worksContractedCents)}</span>
            <b>{formatBRL(overview.worksBudgetCents - overview.worksContractedCents)} de diferença</b>
          </article>
        </div>
      </section>

      <section className="finance-store-detail__filters" aria-label="Filtros do detalhe da loja">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar item, compra, fornecedor, serviço ou responsável"
          />
        </label>
        <label>
          Situação dos itens
          <select value={itemStatusFilter} onChange={(event) => setItemStatusFilter(event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Situação das obras
          <select value={workStatusFilter} onChange={(event) => setWorkStatusFilter(event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(WORK_STATUS_LABELS)
              .filter(([value]) => value !== 'cancelled')
              .map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
          </select>
        </label>
        <label>
          Categoria da obra
          <select value={workCategoryFilter} onChange={(event) => setWorkCategoryFilter(event.target.value)}>
            <option value="">Todas</option>
            {workCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="finance-store-detail__panel">
        <header>
          <div>
            <ShoppingCart size={19} />
            <div>
              <h3>Itens da loja</h3>
              <p>Orçamento aprovado x compra efetivamente registrada.</p>
            </div>
          </div>
          <span>{filteredItemRows.length} linha(s)</span>
        </header>
        {filteredItemRows.length ? (
          <div className="finance-store-detail__table-scroll">
            <table className="finance-store-detail__table">
              <thead>
                <tr className="finance-store-detail__table-groups">
                  <th rowSpan={2}>Item</th>
                  <th colSpan={2}>Orçamento</th>
                  <th colSpan={3}>Realização</th>
                  <th rowSpan={2}>Origem</th>
                  <th rowSpan={2}>Situação</th>
                </tr>
                <tr>
                  <th>Qtd. aprovada</th>
                  <th>Orçado</th>
                  <th>Qtd. comprada</th>
                  <th>Comprado</th>
                  <th>Diferença atual</th>
                </tr>
              </thead>
              <tbody>
                {filteredItemRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.itemCode}</strong>
                      <span>{row.itemName}</span>
                    </td>
                    <td>{quantityLabel(row.approvedQuantity, row.unit)}</td>
                    <td><strong>{formatBRL(row.budgetCents)}</strong></td>
                    <td>{quantityLabel(row.purchasedQuantity, row.unit)}</td>
                    <td><strong>{formatBRL(row.realizedCents)}</strong></td>
                    <td>
                      <strong className={row.differenceCents < 0n ? 'value-negative' : 'value-positive'}>
                        {formatBRL(row.differenceCents)}
                      </strong>
                    </td>
                    <td>
                      <strong>{row.purchaseCode}</strong>
                      <span>{row.quoteCode}</span>
                      <small>{row.supplierName}</small>
                    </td>
                    <td>
                      <span className={`finance-store-status finance-store-status--${row.purchaseStatus}`}>
                        {ITEM_STATUS_LABELS[row.purchaseStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Sem itens aprovados para esta loja"
            detail="Quando uma cotação for aprovada para a loja, ela aparecerá aqui."
          />
        )}
      </section>

      <section className="finance-store-detail__panel">
        <header>
          <div>
            <HardHat size={19} />
            <div>
              <h3>Obras e Serviços</h3>
              <p>Orçado, contratado, pago e documentação por serviço.</p>
            </div>
          </div>
          <Link to="/obras" className="button button--secondary button--small">
            Abrir Obras e Serviços
          </Link>
        </header>
        {filteredStoreWorks.length ? (
          <div className="finance-store-detail__table-scroll">
            <table className="finance-store-detail__table finance-store-detail__table--works">
              <thead>
                <tr className="finance-store-detail__table-groups">
                  <th rowSpan={2}>Serviço</th>
                  <th colSpan={3}>Orçamento e contratação</th>
                  <th colSpan={2}>Financeiro</th>
                  <th colSpan={2}>Documentação</th>
                  <th colSpan={2}>Execução</th>
                </tr>
                <tr>
                  <th>Orçado</th>
                  <th>Contratado</th>
                  <th>Diferença</th>
                  <th>Pago</th>
                  <th>A pagar</th>
                  <th>Documentado</th>
                  <th>Docs</th>
                  <th>Execução</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filteredStoreWorks.map((work) => {
                  const totals = workTotals(work);
                  return (
                    <tr key={work.id}>
                      <td>
                        <strong>{work.code} · {work.category}</strong>
                        <span>{work.description}</span>
                        <small>{work.providerName || 'Responsável não informado'}</small>
                      </td>
                      <td><strong>{formatBRL(totals.budgetCents)}</strong></td>
                      <td><strong>{formatBRL(totals.contractedCents)}</strong></td>
                      <td>
                        <strong className={totals.differenceCents < 0n ? 'value-negative' : 'value-positive'}>
                          {formatBRL(totals.differenceCents)}
                        </strong>
                      </td>
                      <td>{formatBRL(totals.paidCents)}</td>
                      <td>{formatBRL(totals.payableCents)}</td>
                      <td>
                        <strong>{formatBRL(totals.documentedCents)}</strong>
                        {totals.missingDocumentsCents > 0n && (
                          <small>{formatBRL(totals.missingDocumentsCents)} pendente</small>
                        )}
                      </td>
                      <td>{work.documents.length}</td>
                      <td>{work.progressPercent}%</td>
                      <td>
                        <span className={`finance-store-work-status finance-store-work-status--${work.status}`}>
                          {WORK_STATUS_LABELS[work.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Sem obras ou serviços cadastrados"
            detail="Cadastre os serviços no módulo Obras e Serviços para compor esta visão."
          />
        )}
      </section>
    </div>
  );
}
