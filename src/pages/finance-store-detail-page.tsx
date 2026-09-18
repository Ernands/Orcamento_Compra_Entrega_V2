import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
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
  buildFinanceStoreCompositionRows,
  buildFinanceStoreItemRows,
  type FinanceOverviewStoreRow,
} from '../domain/finance-overview';
import { formatQuantityV2 } from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { PurchaseAttachmentV2, PurchaseV2 } from '../domain/purchase-v2-types';
import type { Store } from '../domain/types';
import type { FinanceStoreBudget, WorkService } from '../domain/works-types';
import {
  createPurchaseAttachmentSignedUrlV2,
  listSupplyPurchasesV2,
} from '../data/purchases/purchases-v2-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  createWorkDocumentSignedUrl,
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

const PURCHASE_DOCUMENT_LABELS: Record<string, string> = {
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  payment_proof: 'Comprovante',
  boleto: 'Boleto',
  purchase_order: 'Pedido',
  reimbursement: 'Reembolso',
  photo: 'Foto',
  other: 'Arquivo',
};

const WORK_DOCUMENT_LABELS: Record<string, string> = {
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  rpa: 'RPA',
  contract: 'Contrato',
  quote: 'Orçamento',
  payment_proof: 'Comprovante',
  other: 'Outro',
};

function purchaseDocumentCoverage(attachments: PurchaseAttachmentV2[]) {
  const hasFiscal = attachments.some((attachment) =>
    ['invoice', 'receipt'].includes(attachment.documentType),
  );
  const hasFinancial = attachments.some((attachment) =>
    ['payment_proof', 'boleto'].includes(attachment.documentType),
  );
  if (hasFiscal && hasFinancial) return 'complete' as const;
  if (attachments.length) return 'partial' as const;
  return 'pending' as const;
}

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
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

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
  const financeStore = useMemo(
    () => purchaseStoreRows.find((entry) => entry.storeId === storeId) || null,
    [purchaseStoreRows, storeId],
  );
  const itemRows = useMemo(
    () => (storeId ? buildFinanceStoreItemRows(purchases, storeId) : []),
    [purchases, storeId],
  );
  const compositionRows = useMemo(
    () =>
      storeId
        ? buildFinanceStoreCompositionRows({
            storeId,
            purchases,
            purchaseStoreRows,
            works,
          })
        : [],
    [purchaseStoreRows, purchases, storeId, works],
  );
  const purchaseDocumentGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        purchaseCode: string;
        supplierName: string;
        attachments: PurchaseAttachmentV2[];
      }
    >();
    financeStore?.purchases.forEach((purchase) => {
      const current = groups.get(purchase.purchaseId) || {
        purchaseCode: purchase.purchaseCode,
        supplierName: purchase.supplierName,
        attachments: [],
      };
      purchase.attachments.forEach((attachment) => {
        if (!current.attachments.some((entry) => entry.id === attachment.id)) {
          current.attachments.push(attachment);
        }
      });
      groups.set(purchase.purchaseId, current);
    });
    return [...groups.entries()]
      .map(([purchaseId, group]) => ({ purchaseId, ...group }))
      .sort((a, b) => a.purchaseCode.localeCompare(b.purchaseCode, 'pt-BR'));
  }, [financeStore]);
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

  const openPurchaseDocument = async (attachment: PurchaseAttachmentV2) => {
    setOpeningDocumentId(attachment.id);
    setDocumentError(null);
    try {
      window.open(
        await createPurchaseAttachmentSignedUrlV2(attachment.storagePath),
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      setDocumentError('Não foi possível abrir o documento da compra.');
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const openWorkDocument = async (
    work: WorkService,
    document: WorkService['documents'][number],
  ) => {
    if (!document.storagePath) return;
    setOpeningDocumentId(document.id);
    setDocumentError(null);
    try {
      window.open(
        await createWorkDocumentSignedUrl(document.storagePath),
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      setDocumentError(`Não foi possível abrir o documento de ${work.code}.`);
    } finally {
      setOpeningDocumentId(null);
    }
  };

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
            <p>Leitura por grupo, mantendo o fechamento exato com o total financeiro da loja.</p>
          </div>
        </header>
        <div className="finance-store-detail__composition-scroll">
          <table className="finance-store-detail__composition-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Orçado</th>
                <th>Realizado</th>
                <th>Diferença</th>
                <th>Pago</th>
                <th>A pagar</th>
              </tr>
            </thead>
            <tbody>
              {compositionRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                    {row.key === 'works' ? (
                      <small>Serviços, mão de obra e execução</small>
                    ) : (
                      <small>Itens conforme categoria histórica da compra</small>
                    )}
                  </td>
                  <td><strong>{formatBRL(row.budgetCents)}</strong></td>
                  <td>{formatBRL(row.realizedCents)}</td>
                  <td>
                    <strong className={row.differenceCents < 0n ? 'value-negative' : 'value-positive'}>
                      {formatBRL(row.differenceCents)}
                    </strong>
                  </td>
                  <td>{formatBRL(row.paidCents)}</td>
                  <td>{formatBRL(row.payableCents)}</td>
                </tr>
              ))}
              <tr className="finance-store-detail__composition-total">
                <td><strong>Total da loja</strong></td>
                <td><strong>{formatBRL(overview.budgetTotalCents)}</strong></td>
                <td><strong>{formatBRL(overview.realizedTotalCents)}</strong></td>
                <td>
                  <strong className={overview.differenceCents < 0n ? 'value-negative' : 'value-positive'}>
                    {formatBRL(overview.differenceCents)}
                  </strong>
                </td>
                <td><strong>{formatBRL(overview.paidCents)}</strong></td>
                <td><strong>{formatBRL(overview.payableCents)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="finance-store-detail__panel finance-store-detail__documents-panel">
        <header>
          <div>
            <ReceiptText size={19} />
            <div>
              <h3>Documentos da loja</h3>
              <p>Compras e obras reunidas em um único ponto para conferência.</p>
            </div>
          </div>
          <span>
            {purchaseDocumentGroups.reduce((sum, group) => sum + group.attachments.length, 0) +
              storeWorks.reduce((sum, work) => sum + work.documents.length, 0)} arquivo(s)
          </span>
        </header>
        {documentError && <div className="finance-store-detail__document-error">{documentError}</div>}
        <div className="finance-store-detail__documents-grid">
          <article className="finance-store-detail__document-block">
            <header>
              <ShoppingCart size={17} />
              <div>
                <strong>Compras / itens</strong>
                <small>
                  Completo = documento fiscal/recibo + boleto ou comprovante de pagamento.
                </small>
              </div>
            </header>
            {purchaseDocumentGroups.length ? (
              <div className="finance-store-detail__document-list">
                {purchaseDocumentGroups.map((group) => {
                  const coverage = purchaseDocumentCoverage(group.attachments);
                  return (
                    <div className="finance-store-detail__document-row" key={group.purchaseId}>
                      <div>
                        <strong>{group.purchaseCode}</strong>
                        <small>{group.supplierName}</small>
                      </div>
                      <span className={`finance-store-document-status finance-store-document-status--${coverage}`}>
                        {coverage === 'complete' ? 'Completo' : coverage === 'partial' ? 'Parcial' : 'Pendente'}
                      </span>
                      <div className="finance-store-detail__document-actions">
                        {group.attachments.length ? (
                          group.attachments.map((attachment) => (
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              key={attachment.id}
                              disabled={openingDocumentId === attachment.id}
                              onClick={() => void openPurchaseDocument(attachment)}
                              title={attachment.originalName}
                            >
                              <FileText size={14} />
                              {openingDocumentId === attachment.id
                                ? 'Abrindo...'
                                : PURCHASE_DOCUMENT_LABELS[attachment.documentType] || 'Arquivo'}
                              <ExternalLink size={12} />
                            </button>
                          ))
                        ) : (
                          <small>Sem documento anexado.</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="finance-store-detail__document-empty">
                Nenhuma compra realizada com documentos para esta loja.
              </p>
            )}
          </article>

          <article className="finance-store-detail__document-block">
            <header>
              <HardHat size={17} />
              <div>
                <strong>Obras e Serviços</strong>
                <small>Status calculado pelo valor contratado x valor documentado.</small>
              </div>
            </header>
            {storeWorks.length ? (
              <div className="finance-store-detail__document-list">
                {storeWorks.map((work) => {
                  const totals = workTotals(work);
                  const coverage =
                    totals.missingDocumentsCents <= 0n && totals.contractedCents > 0n
                      ? 'complete'
                      : totals.documentedCents > 0n
                        ? 'partial'
                        : 'pending';
                  return (
                    <div className="finance-store-detail__document-row" key={work.id}>
                      <div>
                        <strong>{work.code} · {work.category}</strong>
                        <small>
                          {formatBRL(totals.documentedCents)} documentado de {formatBRL(totals.contractedCents)}
                        </small>
                      </div>
                      <span className={`finance-store-document-status finance-store-document-status--${coverage}`}>
                        {coverage === 'complete' ? 'Completo' : coverage === 'partial' ? 'Parcial' : 'Pendente'}
                      </span>
                      <div className="finance-store-detail__document-actions">
                        {work.documents.length ? (
                          work.documents.map((document) =>
                            document.storagePath ? (
                              <button
                                type="button"
                                className="button button--secondary button--small"
                                key={document.id}
                                disabled={openingDocumentId === document.id}
                                onClick={() => void openWorkDocument(work, document)}
                              >
                                <FileText size={14} />
                                {openingDocumentId === document.id
                                  ? 'Abrindo...'
                                  : WORK_DOCUMENT_LABELS[document.documentType] || 'Documento'}
                                <ExternalLink size={12} />
                              </button>
                            ) : (
                              <span className="finance-store-detail__document-no-file" key={document.id}>
                                {WORK_DOCUMENT_LABELS[document.documentType] || 'Documento'} sem arquivo
                              </span>
                            ),
                          )
                        ) : (
                          <small>Sem documento cadastrado.</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="finance-store-detail__document-empty">
                Nenhuma obra ou serviço cadastrado para esta loja.
              </p>
            )}
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
                      <small>
                        {row.itemSubcategory || row.itemGroupName || row.itemCategory || 'Sem categoria'}
                      </small>
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
