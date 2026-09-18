import {
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  HardHat,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import { listStores } from '../data/stores/stores-repository';
import {
  createWorkDocumentSignedUrl,
  listWorkServices,
  saveWorkDocument,
  saveWorkPayment,
  saveWorkService,
} from '../data/works/works-repository';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { Store } from '../domain/types';
import type {
  WorkDocumentStatus,
  WorkDocumentType,
  WorkPaymentStatus,
  WorkService,
  WorkServiceStatus,
} from '../domain/works-types';
import './works-page.css';

const CATEGORIES = [
  'Elétrica',
  'Hidráulica',
  'Gesso / Drywall',
  'Pedreiro / Alvenaria',
  'Pintura',
  'Piso / Revestimento',
  'Fachada / Comunicação visual',
  'Vidraçaria',
  'Marcenaria',
  'Ar-condicionado / Instalação',
  'CFTV / Segurança',
  'Internet / Cabeamento',
  'Acessibilidade',
  'Outros',
];

const STATUS_LABELS: Record<WorkServiceStatus, string> = {
  budget: 'Orçamento',
  awaiting_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  contracted: 'Contratado',
  in_progress: 'Em execução',
  paused: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const PAYMENT_STATUS_LABELS: Record<WorkPaymentStatus, string> = {
  planned: 'A pagar',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

const DOCUMENT_LABELS: Record<WorkDocumentType, string> = {
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  rpa: 'RPA',
  other: 'Outro',
};

const PAYMENT_METHODS = [
  ['pix', 'PIX'],
  ['boleto', 'Boleto'],
  ['bank_transfer', 'Transferência bancária'],
  ['credit_card', 'Cartão de crédito'],
  ['cash', 'Dinheiro'],
  ['other', 'Outro'],
] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function serviceTotals(service: WorkService) {
  const contractedCents = moneyToCents(service.contractedAmount);
  const paidCents = service.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
  const documentedCents = service.documents.reduce(
    (sum, document) =>
      sum + (document.documentAmount ? moneyToCents(document.documentAmount) : 0n),
    0n,
  );
  return {
    budgetCents: moneyToCents(service.budgetAmount),
    contractedCents,
    paidCents,
    payableCents: contractedCents > paidCents ? contractedCents - paidCents : 0n,
    documentedCents,
    missingDocumentsCents:
      contractedCents > documentedCents ? contractedCents - documentedCents : 0n,
  };
}

function WorkServiceModal({
  service,
  stores,
  onClose,
  onSaved,
}: {
  service: WorkService | null;
  stores: Store[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [storeId, setStoreId] = useState(service?.storeId || stores[0]?.id || '');
  const [category, setCategory] = useState(service?.category || CATEGORIES[0]);
  const [description, setDescription] = useState(service?.description || '');
  const [providerName, setProviderName] = useState(service?.providerName || '');
  const [providerTaxId, setProviderTaxId] = useState(service?.providerTaxId || '');
  const [providerPhone, setProviderPhone] = useState(service?.providerPhone || '');
  const [budgetAmount, setBudgetAmount] = useState(service?.budgetAmount || '');
  const [contractedAmount, setContractedAmount] = useState(service?.contractedAmount || '');
  const [status, setStatus] = useState<WorkServiceStatus>(service?.status || 'budget');
  const [progressPercent, setProgressPercent] = useState(service?.progressPercent || 0);
  const [plannedStartDate, setPlannedStartDate] = useState(service?.plannedStartDate || '');
  const [plannedEndDate, setPlannedEndDate] = useState(service?.plannedEndDate || '');
  const [notes, setNotes] = useState(service?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || !description.trim() || !category.trim()) {
      setError('Informe loja, categoria e descrição do serviço.');
      return;
    }
    if (moneyToCents(budgetAmount || '0') < 0n || moneyToCents(contractedAmount || '0') < 0n) {
      setError('Os valores não podem ser negativos.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveWorkService({
        id: service?.id,
        storeId,
        category,
        description,
        providerName,
        providerTaxId,
        providerPhone,
        budgetAmount: budgetAmount || '0',
        contractedAmount: contractedAmount || '0',
        status,
        progressPercent,
        plannedStartDate,
        plannedEndDate,
        notes,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar o serviço.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={service ? `Editar ${service.code}` : 'Novo serviço de obra'}
      description="Obra fica separada dos itens de Compras e alimenta o Financeiro automaticamente."
      onClose={onClose}
      className="works-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <section className="works-form-section">
          <header>
            <span>1</span>
            <div>
              <strong>Identificação</strong>
              <small>Loja, categoria, responsável e descrição.</small>
            </div>
          </header>
          <div className="form-grid form-grid--three">
            <label className="field">
              Loja
              <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} · {store.name} · {store.city}/{store.state}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Categoria
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((entry) => (
                  <option key={entry}>{entry}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Responsável / fornecedor
              <input
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
                placeholder="Nome ou razão social"
              />
            </label>
          </div>
          <label className="field">
            Descrição do serviço
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: adequação elétrica completa da loja"
            />
          </label>
          <div className="form-grid form-grid--two">
            <label className="field">
              CPF / CNPJ
              <input
                value={providerTaxId}
                onChange={(event) => setProviderTaxId(event.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="field">
              Telefone
              <input
                value={providerPhone}
                onChange={(event) => setProviderPhone(event.target.value)}
                placeholder="Opcional"
              />
            </label>
          </div>
        </section>

        <section className="works-form-section">
          <header>
            <span>2</span>
            <div>
              <strong>Orçamento e contratação</strong>
              <small>O Financeiro compara esses valores automaticamente.</small>
            </div>
          </header>
          <div className="form-grid form-grid--three">
            <label className="field">
              Valor orçado
              <input
                inputMode="decimal"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Valor contratado
              <input
                inputMode="decimal"
                value={contractedAmount}
                onChange={(event) => setContractedAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Situação
              <select value={status} onChange={(event) => setStatus(event.target.value as WorkServiceStatus)}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--three">
            <label className="field">
              Início previsto
              <input
                type="date"
                value={plannedStartDate}
                onChange={(event) => setPlannedStartDate(event.target.value)}
              />
            </label>
            <label className="field">
              Conclusão prevista
              <input
                type="date"
                value={plannedEndDate}
                onChange={(event) => setPlannedEndDate(event.target.value)}
              />
            </label>
            <label className="field">
              Execução (%)
              <input
                type="number"
                min={0}
                max={100}
                value={progressPercent}
                onChange={(event) =>
                  setProgressPercent(Math.max(0, Math.min(100, Number(event.target.value))))
                }
              />
            </label>
          </div>
          <label className="field">
            Observações
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </section>

        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : service ? 'Salvar alterações' : 'Criar serviço'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkPaymentModal({
  service,
  onClose,
  onSaved,
}: {
  service: WorkService;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(service.payments.length ? `Parcela ${service.payments.length + 1}` : 'Entrada');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [sourceLabel, setSourceLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<WorkPaymentStatus>('planned');
  const [paidAt, setPaidAt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || moneyToCents(amount || '0') <= 0n) {
      setError('Informe a parcela e um valor maior que zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveWorkPayment({
        serviceId: service.id,
        storeId: service.storeId,
        label,
        paymentMethod,
        sourceLabel,
        dueDate,
        amount,
        status,
        paidAt,
        notes,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar o pagamento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Adicionar pagamento / parcela"
      description={`${service.code} · ${service.description}`}
      onClose={onClose}
      className="works-payment-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid form-grid--three">
          <label className="field">
            Parcela
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label className="field">
            Valor
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            Situação
            <select value={status} onChange={(event) => setStatus(event.target.value as WorkPaymentStatus)}>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid form-grid--three">
          <label className="field">
            Forma
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {PAYMENT_METHODS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Vencimento
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="field">
            Origem / referência
            <input
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              placeholder="Ex.: boleto, conta operacional"
            />
          </label>
        </div>
        {status === 'paid' && (
          <label className="field">
            Data do pagamento
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </label>
        )}
        <label className="field">
          Observações
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Adicionar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkDocumentModal({
  service,
  onClose,
  onSaved,
}: {
  service: WorkService;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [documentType, setDocumentType] = useState<WorkDocumentType>('invoice');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [documentAmount, setDocumentAmount] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [status, setStatus] = useState<WorkDocumentStatus>('pending');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!documentNumber.trim() && !file) {
      setError('Informe ao menos o número do documento ou anexe o arquivo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveWorkDocument({
        serviceId: service.id,
        storeId: service.storeId,
        paymentId,
        documentType,
        documentNumber,
        documentDate,
        documentAmount,
        status,
        notes,
        file,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar o documento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Adicionar nota / recibo"
      description="É possível registrar quantos documentos forem necessários. O arquivo é opcional."
      onClose={onClose}
      className="works-document-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid form-grid--three">
          <label className="field">
            Tipo
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as WorkDocumentType)}>
              {Object.entries(DOCUMENT_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Número
            <input
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder="NF, recibo, RPA..."
            />
          </label>
          <label className="field">
            Data
            <input
              type="date"
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
            />
          </label>
        </div>
        <div className="form-grid form-grid--three">
          <label className="field">
            Valor
            <input
              inputMode="decimal"
              value={documentAmount}
              onChange={(event) => setDocumentAmount(event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            Pagamento relacionado
            <select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
              <option value="">Não vincular</option>
              {service.payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.label} · {formatBRL(moneyToCents(payment.amount))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Conferência
            <select value={status} onChange={(event) => setStatus(event.target.value as WorkDocumentStatus)}>
              <option value="pending">Pendente</option>
              <option value="verified">Conferido</option>
            </select>
          </label>
        </div>
        <label className="field">
          Arquivo (opcional)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
        <label className="field">
          Observações
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Adicionar documento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function WorksPage() {
  const { can } = useSession();
  const canManage = can('works.manage');
  const [stores, setStores] = useState<Store[]>([]);
  const [services, setServices] = useState<WorkService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [serviceModal, setServiceModal] = useState<WorkService | 'new' | null>(null);
  const [paymentService, setPaymentService] = useState<WorkService | null>(null);
  const [documentService, setDocumentService] = useState<WorkService | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStores, nextServices] = await Promise.all([listStores(), listWorkServices()]);
      setStores(nextStores);
      setServices(nextServices);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Não foi possível carregar Obras e Serviços.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const states = useMemo(
    () => [...new Set(stores.map((store) => store.state))].sort(),
    [stores],
  );

  const filtered = useMemo(() => {
    const search = normalized(query);
    return services
      .filter((service) => !stateFilter || service.storeState === stateFilter)
      .filter((service) => !storeFilter || service.storeId === storeFilter)
      .filter(
        (service) =>
          !search ||
          normalized(
            [
              service.code,
              service.storeCode,
              service.storeName,
              service.storeCity,
              service.storeState,
              service.category,
              service.description,
              service.providerName || '',
            ].join(' '),
          ).includes(search),
      );
  }, [query, services, stateFilter, storeFilter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, service) => {
          const current = serviceTotals(service);
          sum.budgetCents += current.budgetCents;
          sum.contractedCents += current.contractedCents;
          sum.paidCents += current.paidCents;
          sum.payableCents += current.payableCents;
          sum.missingDocumentsCents += current.missingDocumentsCents;
          return sum;
        },
        {
          budgetCents: 0n,
          contractedCents: 0n,
          paidCents: 0n,
          payableCents: 0n,
          missingDocumentsCents: 0n,
        },
      ),
    [filtered],
  );

  const openDocument = async (service: WorkService, documentId: string) => {
    const document = service.documents.find((entry) => entry.id === documentId);
    if (!document?.storagePath) return;
    setOpeningDocumentId(document.id);
    setError(null);
    try {
      window.open(
        await createWorkDocumentSignedUrl(document.storagePath),
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      setError('Não foi possível abrir o documento.');
    } finally {
      setOpeningDocumentId(null);
    }
  };

  return (
    <div className="page-stack works-page">
      <header className="page-heading works-heading">
        <div>
          <span className="eyebrow">Obras e Serviços</span>
          <h2>Orçamento, contratação, pagamentos e documentos</h2>
          <p>
            Fluxo separado de Compras para elétrica, hidráulica, gesso, pedreiro e demais serviços
            da implantação.
          </p>
        </div>
        <div className="page-heading__actions">
          <button className="button button--secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={17} className={loading ? 'spin' : undefined} />
            Atualizar
          </button>
          {canManage && (
            <button className="button button--primary" onClick={() => setServiceModal('new')}>
              <Plus size={18} />
              Novo serviço
            </button>
          )}
        </div>
      </header>

      <section className="works-kpis">
        <article>
          <HardHat size={21} />
          <span>Orçado em obras</span>
          <strong>{formatBRL(totals.budgetCents)}</strong>
        </article>
        <article>
          <Building2 size={21} />
          <span>Contratado</span>
          <strong>{formatBRL(totals.contractedCents)}</strong>
        </article>
        <article className="works-kpi--paid">
          <WalletCards size={21} />
          <span>Pago</span>
          <strong>{formatBRL(totals.paidCents)}</strong>
        </article>
        <article>
          <CalendarDays size={21} />
          <span>A pagar</span>
          <strong>{formatBRL(totals.payableCents)}</strong>
        </article>
        <article className={totals.missingDocumentsCents > 0n ? 'works-kpi--warning' : ''}>
          <ReceiptText size={21} />
          <span>Falta documentar</span>
          <strong>{formatBRL(totals.missingDocumentsCents)}</strong>
        </article>
      </section>

      <section className="works-controls">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar loja, serviço, categoria ou responsável"
          />
        </label>
        <label className="works-filter">
          UF
          <select
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
        <label className="works-filter">
          Loja
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
            <option value="">Todas as lojas</option>
            {stores
              .filter((store) => !stateFilter || store.state === stateFilter)
              .map((store) => (
                <option value={store.id} key={store.id}>
                  {store.code} · {store.name}
                </option>
              ))}
          </select>
        </label>
      </section>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? (
        <InlineLoading label="Carregando obras e serviços" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum serviço cadastrado"
          detail="Cadastre elétrica, hidráulica, gesso, pintura, pedreiro ou outro serviço da implantação."
        />
      ) : (
        <section className="works-list">
          <header className="works-list__heading">
            <div>
              <h3>Serviços por loja</h3>
              <p>Expanda um serviço para ver parcelas e notas/recibos.</p>
            </div>
            <span>{filtered.length} serviço(s)</span>
          </header>
          {filtered.map((service) => {
            const current = serviceTotals(service);
            return (
              <details className="works-card" key={service.id}>
                <summary>
                  <div className="works-card__identity">
                    <span>{service.code}</span>
                    <strong>{service.description}</strong>
                    <small>
                      {service.storeCode} · {service.storeName} · {service.storeCity}/{service.storeState}
                    </small>
                  </div>
                  <div>
                    <span>Orçado / contratado</span>
                    <strong>{formatBRL(current.budgetCents)}</strong>
                    <small>{formatBRL(current.contractedCents)} contratado</small>
                  </div>
                  <div>
                    <span>Pago / a pagar</span>
                    <strong>{formatBRL(current.paidCents)}</strong>
                    <small>{formatBRL(current.payableCents)} a pagar</small>
                  </div>
                  <div>
                    <span>Documentação</span>
                    <strong>{formatBRL(current.documentedCents)}</strong>
                    <small>
                      {current.missingDocumentsCents > 0n
                        ? `${formatBRL(current.missingDocumentsCents)} pendente`
                        : 'Completa'}
                    </small>
                  </div>
                  <div className="works-card__status">
                    <span className={`works-status works-status--${service.status}`}>
                      {STATUS_LABELS[service.status]}
                    </span>
                    <small>{service.progressPercent}% executado</small>
                  </div>
                  <ChevronDown size={18} />
                </summary>

                <div className="works-card__content">
                  <div className="works-card__meta">
                    <div>
                      <span>Categoria</span>
                      <strong>{service.category}</strong>
                    </div>
                    <div>
                      <span>Responsável</span>
                      <strong>{service.providerName || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span>Período previsto</span>
                      <strong>
                        {formatDate(service.plannedStartDate)} → {formatDate(service.plannedEndDate)}
                      </strong>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        className="button button--secondary button--small"
                        onClick={() => setServiceModal(service)}
                      >
                        <Pencil size={15} />
                        Editar serviço
                      </button>
                    )}
                  </div>

                  <section className="works-detail-block">
                    <header>
                      <div>
                        <WalletCards size={17} />
                        <strong>Pagamentos</strong>
                        <span>Cada parcela possui situação própria.</span>
                      </div>
                      {canManage && (
                        <button
                          className="button button--secondary button--small"
                          onClick={() => setPaymentService(service)}
                        >
                          <Plus size={15} />
                          Adicionar parcela
                        </button>
                      )}
                    </header>
                    {service.payments.length ? (
                      <div className="works-mini-table">
                        <div className="works-mini-table__header">
                          <span>Parcela</span>
                          <span>Vencimento</span>
                          <span>Valor</span>
                          <span>Forma</span>
                          <span>Situação</span>
                        </div>
                        {service.payments.map((payment) => (
                          <div key={payment.id}>
                            <strong>{payment.label}</strong>
                            <span>{formatDate(payment.dueDate)}</span>
                            <strong>{formatBRL(moneyToCents(payment.amount))}</strong>
                            <span>{payment.sourceLabel || payment.paymentMethod}</span>
                            <span className={`works-payment works-payment--${payment.status}`}>
                              {PAYMENT_STATUS_LABELS[payment.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="works-empty-line">Nenhum pagamento cadastrado.</p>
                    )}
                  </section>

                  <section className="works-detail-block">
                    <header>
                      <div>
                        <ReceiptText size={17} />
                        <strong>Notas / recibos</strong>
                        <span>Um serviço pode possuir vários documentos.</span>
                      </div>
                      {canManage && (
                        <button
                          className="button button--secondary button--small"
                          onClick={() => setDocumentService(service)}
                        >
                          <Plus size={15} />
                          Adicionar documento
                        </button>
                      )}
                    </header>
                    {service.documents.length ? (
                      <div className="works-documents">
                        {service.documents.map((document) => (
                          <article key={document.id}>
                            <FileText size={19} />
                            <div>
                              <strong>
                                {DOCUMENT_LABELS[document.documentType]}
                                {document.documentNumber ? ` · ${document.documentNumber}` : ''}
                              </strong>
                              <span>
                                {formatDate(document.documentDate)} ·{' '}
                                {document.documentAmount
                                  ? formatBRL(moneyToCents(document.documentAmount))
                                  : 'Valor não informado'}
                              </span>
                              <small>
                                {document.status === 'verified' ? 'Conferido' : 'Pendente de conferência'}
                                {document.paymentId ? ' · vinculado a pagamento' : ''}
                              </small>
                            </div>
                            {document.storagePath ? (
                              <button
                                className="button button--secondary button--small"
                                disabled={openingDocumentId === document.id}
                                onClick={() => void openDocument(service, document.id)}
                              >
                                <Paperclip size={14} />
                                {openingDocumentId === document.id ? 'Abrindo...' : 'Arquivo'}
                              </button>
                            ) : (
                              <span className="works-document-no-file">Sem arquivo</span>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="works-empty-line">Nenhuma nota ou recibo cadastrado.</p>
                    )}
                  </section>
                </div>
              </details>
            );
          })}
        </section>
      )}

      {serviceModal && (
        <WorkServiceModal
          key={serviceModal === 'new' ? 'new' : serviceModal.id}
          service={serviceModal === 'new' ? null : serviceModal}
          stores={stores}
          onClose={() => setServiceModal(null)}
          onSaved={load}
        />
      )}
      {paymentService && (
        <WorkPaymentModal
          key={paymentService.id}
          service={paymentService}
          onClose={() => setPaymentService(null)}
          onSaved={load}
        />
      )}
      {documentService && (
        <WorkDocumentModal
          key={documentService.id}
          service={documentService}
          onClose={() => setDocumentService(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
