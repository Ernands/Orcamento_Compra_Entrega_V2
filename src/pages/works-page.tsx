import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  HardHat,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, Modal } from '../components/ui';
import { listStores } from '../data/stores/stores-repository';
import {
  createWorkDocumentSignedUrl,
  deleteWorkDocument,
  listWorkServices,
  saveWorkDocument,
  saveWorkPayments,
  saveWorkService,
  updateWorkDocument,
} from '../data/works/works-repository';
import { formatBRL, moneyToCents } from '../domain/supply-calculations';
import type { Store } from '../domain/types';
import type {
  WorkDocumentStatus,
  WorkDocumentType,
  WorkPaymentStatus,
  WorkService,
  WorkServiceDocument,
  WorkServicePayment,
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
  'Serviços Diversos de Obra',
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
  quote: 'Orçamento',
  invoice: 'Nota fiscal',
  receipt: 'Recibo',
  rpa: 'RPA',
  payment_proof: 'Comprovante de pagamento',
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
  const documentedCents = service.documents
    .filter(
      (document) => document.documentType !== 'quote' && document.documentType !== 'payment_proof',
    )
    .reduce(
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

function centsToInput(value: bigint): string {
  return (Number(value) / 100).toFixed(2).replace('.', ',');
}

type ComponentDraft = {
  key: string;
  category: string;
  description: string;
  amount: string;
};

function newComponentDraft(): ComponentDraft {
  return {
    key: crypto.randomUUID(),
    category: 'Elétrica',
    description: '',
    amount: '',
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
  const [itemizeComponents, setItemizeComponents] = useState(Boolean(service?.components.length));
  const [components, setComponents] = useState<ComponentDraft[]>(
    service?.components.length
      ? service.components.map((component) => ({
          key: component.id,
          category: component.category,
          description: component.description || '',
          amount: component.amount,
        }))
      : [newComponentDraft()],
  );
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [persistedServiceId, setPersistedServiceId] = useState<string | null>(service?.id || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesComponents = category === 'Serviços Diversos de Obra' && itemizeComponents;
  const componentTotal = usesComponents
    ? components.reduce((sum, component) => sum + moneyToCents(component.amount || '0'), 0n)
    : moneyToCents(contractedAmount || '0');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || !description.trim() || !category.trim()) {
      setError('Informe loja, categoria e descrição do serviço.');
      return;
    }
    if (moneyToCents(budgetAmount || '0') < 0n || componentTotal < 0n) {
      setError('Os valores não podem ser negativos.');
      return;
    }
    if (
      usesComponents &&
      (!components.length ||
        components.some(
          (component) => !component.category.trim() || moneyToCents(component.amount || '0') <= 0n,
        ))
    ) {
      setError('Informe a categoria e um valor maior que zero em cada serviço discriminado.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const serviceId = await saveWorkService({
        id: persistedServiceId,
        storeId,
        category,
        description,
        providerName,
        providerTaxId,
        providerPhone,
        budgetAmount: budgetAmount || '0',
        contractedAmount: usesComponents ? centsToInput(componentTotal) : contractedAmount || '0',
        status,
        progressPercent,
        plannedStartDate,
        plannedEndDate,
        notes,
        components: usesComponents
          ? components.map(
              ({ category: entryCategory, description: entryDescription, amount }) => ({
                category: entryCategory,
                description: entryDescription,
                amount,
              }),
            )
          : [],
      });
      setPersistedServiceId(serviceId);
      for (const file of quoteFiles) {
        await saveWorkDocument({
          serviceId,
          storeId,
          paymentId: '',
          documentType: 'quote',
          documentNumber: '',
          documentDate: '',
          documentAmount: '',
          status: 'pending',
          notes: 'Orçamento anexado no cadastro do serviço',
          file,
        });
        setQuoteFiles((current) => current.filter((entry) => entry !== file));
      }
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
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  if (event.target.value !== 'Serviços Diversos de Obra') {
                    setItemizeComponents(false);
                  }
                }}
              >
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
              Valor contratado
              <input
                inputMode="decimal"
                value={usesComponents ? centsToInput(componentTotal) : contractedAmount}
                onChange={(event) => setContractedAmount(event.target.value)}
                placeholder="0,00"
                readOnly={usesComponents}
              />
            </label>
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
          {category === 'Serviços Diversos de Obra' && (
            <div className="works-components-editor">
              <label className="works-check-field">
                <input
                  type="checkbox"
                  checked={itemizeComponents}
                  onChange={(event) => setItemizeComponents(event.target.checked)}
                />
                <span>
                  <strong>Discriminar categorias e valores</strong>
                  <small>
                    Desmarque para informar somente um valor contratado para todo o serviço.
                  </small>
                </span>
              </label>
              {itemizeComponents && (
                <div className="works-components-editor__rows">
                  {components.map((component, index) => (
                    <div className="works-component-row" key={component.key}>
                      <label className="field">
                        Serviço {index + 1}
                        <select
                          value={component.category}
                          onChange={(event) =>
                            setComponents((current) =>
                              current.map((entry) =>
                                entry.key === component.key
                                  ? { ...entry, category: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        >
                          {CATEGORIES.filter((entry) => entry !== 'Serviços Diversos de Obra').map(
                            (entry) => (
                              <option key={entry}>{entry}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="field">
                        Descrição
                        <input
                          value={component.description}
                          onChange={(event) =>
                            setComponents((current) =>
                              current.map((entry) =>
                                entry.key === component.key
                                  ? { ...entry, description: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="Opcional"
                        />
                      </label>
                      <label className="field">
                        Valor
                        <input
                          inputMode="decimal"
                          value={component.amount}
                          onChange={(event) =>
                            setComponents((current) =>
                              current.map((entry) =>
                                entry.key === component.key
                                  ? { ...entry, amount: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="0,00"
                        />
                      </label>
                      <button
                        type="button"
                        className="button button--secondary button--icon"
                        aria-label={`Remover serviço ${index + 1}`}
                        disabled={components.length === 1}
                        onClick={() =>
                          setComponents((current) =>
                            current.filter((entry) => entry.key !== component.key),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button button--secondary button--small works-add-row"
                    onClick={() => setComponents((current) => [...current, newComponentDraft()])}
                  >
                    <Plus size={15} />
                    Adicionar serviço discriminado
                  </button>
                  <div className="works-components-total">
                    Total contratado <strong>{formatBRL(componentTotal)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
          <label className="field">
            Orçamentos anexos (opcional)
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
              onChange={(event) => setQuoteFiles(Array.from(event.target.files || []))}
            />
            <small>
              Selecione um ou mais arquivos. Novos anexos podem ser incluídos também ao editar.
            </small>
          </label>
          {quoteFiles.length > 0 && (
            <div className="works-selected-files">
              {quoteFiles.map((file, index) => (
                <span key={`${file.name}-${file.lastModified}`}>
                  <FileText size={14} />
                  {file.name}
                  <button
                    type="button"
                    aria-label={`Remover ${file.name}`}
                    onClick={() =>
                      setQuoteFiles((current) =>
                        current.filter((_, fileIndex) => fileIndex !== index),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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

type PaymentDocumentDraft = {
  key: string;
  documentType: WorkDocumentType;
  documentNumber: string;
  documentDate: string;
  documentAmount: string;
  status: WorkDocumentStatus;
  notes: string;
  file: File | null;
};

type PaymentDraft = {
  key: string;
  id: string | null;
  label: string;
  paymentMethod: string;
  sourceLabel: string;
  dueDate: string;
  amount: string;
  status: WorkPaymentStatus;
  paidAt: string;
  notes: string;
  documents: PaymentDocumentDraft[];
};

function newPaymentDocumentDraft(): PaymentDocumentDraft {
  return {
    key: crypto.randomUUID(),
    documentType: 'payment_proof',
    documentNumber: '',
    documentDate: '',
    documentAmount: '',
    status: 'pending',
    notes: '',
    file: null,
  };
}

function newPaymentDraft(service: WorkService, payment?: WorkServicePayment): PaymentDraft {
  const id = payment?.id || crypto.randomUUID();
  return {
    key: id,
    id,
    label:
      payment?.label ||
      (service.payments.length ? `Parcela ${service.payments.length + 1}` : 'Entrada'),
    paymentMethod: payment?.paymentMethod || 'pix',
    sourceLabel: payment?.sourceLabel || '',
    dueDate: payment?.dueDate || '',
    amount: payment?.amount || '',
    status: payment?.status || 'planned',
    paidAt: payment?.paidAt?.slice(0, 16) || '',
    notes: payment?.notes || '',
    documents: [],
  };
}

function WorkPaymentModal({
  service,
  payment,
  onClose,
  onSaved,
}: {
  service: WorkService;
  payment: WorkServicePayment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [payments, setPayments] = useState<PaymentDraft[]>([
    newPaymentDraft(service, payment || undefined),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePayment = (key: string, values: Partial<PaymentDraft>) => {
    setPayments((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...values } : entry)),
    );
  };

  const updateDocument = (
    paymentKey: string,
    documentKey: string,
    values: Partial<PaymentDocumentDraft>,
  ) => {
    setPayments((current) =>
      current.map((entry) =>
        entry.key === paymentKey
          ? {
              ...entry,
              documents: entry.documents.map((document) =>
                document.key === documentKey ? { ...document, ...values } : document,
              ),
            }
          : entry,
      ),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (payments.some((entry) => !entry.label.trim() || moneyToCents(entry.amount || '0') <= 0n)) {
      setError('Informe a identificação e um valor maior que zero em cada Pagamento/Parcelamento.');
      return;
    }
    if (
      payments.some((entry) =>
        entry.documents.some((document) => !document.documentNumber.trim() && !document.file),
      )
    ) {
      setError('Em cada documento, informe o número ou anexe um arquivo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const paymentIds = await saveWorkPayments(
        payments.map((entry) => ({
          id: entry.id,
          serviceId: service.id,
          storeId: service.storeId,
          label: entry.label,
          paymentMethod: entry.paymentMethod,
          sourceLabel: entry.sourceLabel,
          dueDate: entry.dueDate,
          amount: entry.amount,
          status: entry.status,
          paidAt: entry.paidAt,
          notes: entry.notes,
        })),
      );

      for (const [index, entry] of payments.entries()) {
        for (const document of entry.documents) {
          await saveWorkDocument({
            serviceId: service.id,
            storeId: service.storeId,
            paymentId: paymentIds[index],
            documentType: document.documentType,
            documentNumber: document.documentNumber,
            documentDate: document.documentDate,
            documentAmount: document.documentAmount,
            status: document.status,
            notes: document.notes,
            file: document.file,
          });
          setPayments((current) =>
            current.map((currentPayment) =>
              currentPayment.key === entry.key
                ? {
                    ...currentPayment,
                    documents: currentPayment.documents.filter(
                      (currentDocument) => currentDocument.key !== document.key,
                    ),
                  }
                : currentPayment,
            ),
          );
        }
      }
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Não foi possível salvar o Pagamento/Parcelamento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={payment ? 'Editar Pagamento/Parcelamento' : 'Adicionar Pagamento/Parcelamento'}
      description={`${service.code} · ${service.description}. Registre pago e a pagar na mesma tela.`}
      onClose={onClose}
      className="works-payment-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        {payments.map((entry, paymentIndex) => {
          const linkedDocuments = entry.id
            ? service.documents.filter((document) => document.paymentId === entry.id)
            : [];
          return (
            <section className="works-payment-editor" key={entry.key}>
              <header>
                <div>
                  <strong>Pagamento/Parcelamento {paymentIndex + 1}</strong>
                  <small>O status é individual: pago, a pagar, vencido ou cancelado.</small>
                </div>
                {!payment && payments.length > 1 && (
                  <button
                    type="button"
                    className="button button--secondary button--icon"
                    aria-label={`Remover Pagamento/Parcelamento ${paymentIndex + 1}`}
                    onClick={() =>
                      setPayments((current) => current.filter((item) => item.key !== entry.key))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </header>
              <div className="form-grid form-grid--three">
                <label className="field">
                  Identificação
                  <input
                    value={entry.label}
                    onChange={(event) => updatePayment(entry.key, { label: event.target.value })}
                    placeholder="Entrada, parcela 1/5..."
                  />
                </label>
                <label className="field">
                  Valor
                  <input
                    inputMode="decimal"
                    value={entry.amount}
                    onChange={(event) => updatePayment(entry.key, { amount: event.target.value })}
                    placeholder="0,00"
                  />
                </label>
                <label className="field">
                  Situação
                  <select
                    value={entry.status}
                    onChange={(event) =>
                      updatePayment(entry.key, {
                        status: event.target.value as WorkPaymentStatus,
                      })
                    }
                  >
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
                  <select
                    value={entry.paymentMethod}
                    onChange={(event) =>
                      updatePayment(entry.key, { paymentMethod: event.target.value })
                    }
                  >
                    {PAYMENT_METHODS.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Vencimento
                  <input
                    type="date"
                    value={entry.dueDate}
                    onChange={(event) => updatePayment(entry.key, { dueDate: event.target.value })}
                  />
                </label>
                <label className="field">
                  Origem / referência
                  <input
                    value={entry.sourceLabel}
                    onChange={(event) =>
                      updatePayment(entry.key, { sourceLabel: event.target.value })
                    }
                    placeholder="Boleto, conta operacional..."
                  />
                </label>
              </div>
              {entry.status === 'paid' && (
                <label className="field">
                  Data do pagamento
                  <input
                    type="datetime-local"
                    value={entry.paidAt}
                    onChange={(event) => updatePayment(entry.key, { paidAt: event.target.value })}
                  />
                </label>
              )}
              <label className="field">
                Observações
                <textarea
                  rows={2}
                  value={entry.notes}
                  onChange={(event) => updatePayment(entry.key, { notes: event.target.value })}
                />
              </label>

              <div className="works-payment-documents">
                <header>
                  <div>
                    <ReceiptText size={16} />
                    <strong>Documentos deste Pagamento/Parcelamento</strong>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() =>
                      updatePayment(entry.key, {
                        documents: [...entry.documents, newPaymentDocumentDraft()],
                      })
                    }
                  >
                    <Plus size={15} />
                    Adicionar documento
                  </button>
                </header>
                {linkedDocuments.length > 0 && (
                  <div className="works-existing-documents">
                    {linkedDocuments.map((document) => (
                      <span key={document.id}>
                        {DOCUMENT_LABELS[document.documentType]}
                        {document.documentNumber ? ` · ${document.documentNumber}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {entry.documents.map((document, documentIndex) => (
                  <div className="works-payment-document-row" key={document.key}>
                    <label className="field">
                      Tipo
                      <select
                        value={document.documentType}
                        onChange={(event) =>
                          updateDocument(entry.key, document.key, {
                            documentType: event.target.value as WorkDocumentType,
                          })
                        }
                      >
                        {Object.entries(DOCUMENT_LABELS)
                          .filter(([value]) => value !== 'quote')
                          .map(([value, text]) => (
                            <option key={value} value={value}>
                              {text}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      Número
                      <input
                        value={document.documentNumber}
                        onChange={(event) =>
                          updateDocument(entry.key, document.key, {
                            documentNumber: event.target.value,
                          })
                        }
                        placeholder="Opcional se houver arquivo"
                      />
                    </label>
                    <label className="field">
                      Data
                      <input
                        type="date"
                        value={document.documentDate}
                        onChange={(event) =>
                          updateDocument(entry.key, document.key, {
                            documentDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Valor
                      <input
                        inputMode="decimal"
                        value={document.documentAmount}
                        onChange={(event) =>
                          updateDocument(entry.key, document.key, {
                            documentAmount: event.target.value,
                          })
                        }
                        placeholder="0,00"
                      />
                    </label>
                    <label className="field works-document-file-field">
                      Arquivo
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
                        onChange={(event) =>
                          updateDocument(entry.key, document.key, {
                            file: event.target.files?.[0] || null,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button button--secondary button--icon"
                      aria-label={`Remover documento ${documentIndex + 1}`}
                      onClick={() =>
                        updatePayment(entry.key, {
                          documents: entry.documents.filter((item) => item.key !== document.key),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!linkedDocuments.length && !entry.documents.length && (
                  <small>Nenhum documento vinculado. Você pode adicionar um ou mais agora.</small>
                )}
              </div>
            </section>
          );
        })}

        {!payment && (
          <button
            type="button"
            className="button button--secondary works-add-payment"
            onClick={() =>
              setPayments((current) => [
                ...current,
                {
                  ...newPaymentDraft(service),
                  label: `Parcela ${service.payments.length + current.length + 1}`,
                },
              ])
            }
          >
            <Plus size={16} />
            Adicionar outro Pagamento/Parcelamento
          </button>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving
              ? 'Salvando...'
              : payment
                ? 'Salvar Pagamento/Parcelamento'
                : `Salvar ${payments.length} Pagamento/Parcelamento${payments.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkDocumentModal({
  service,
  document,
  onClose,
  onSaved,
}: {
  service: WorkService;
  document: WorkServiceDocument | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [documentType, setDocumentType] = useState<WorkDocumentType>(document?.documentType || 'invoice');
  const [documentNumber, setDocumentNumber] = useState(document?.documentNumber || '');
  const [documentDate, setDocumentDate] = useState(document?.documentDate || '');
  const [documentAmount, setDocumentAmount] = useState(document?.documentAmount || '');
  const [paymentId, setPaymentId] = useState(document?.paymentId || '');
  const [status, setStatus] = useState<WorkDocumentStatus>(document?.status || 'pending');
  const [notes, setNotes] = useState(document?.notes || '');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!documentNumber.trim() && !file && !document?.originalName) {
      setError('Informe ao menos o número do documento ou anexe o arquivo.');
      return;
    }

    setSaving(true);
    setError(null);
    const values = {
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
    };

    try {
      if (document) {
        await updateWorkDocument(document, values);
      } else {
        await saveWorkDocument(values);
      }
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(
        errorMessage(
          saveError,
          document ? 'Não foi possível atualizar o documento.' : 'Não foi possível salvar o documento.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={document ? 'Editar documento' : 'Adicionar nota / recibo'}
      description={
        document
          ? `${service.code} · Altere os dados, vínculo de pagamento ou substitua o arquivo.`
          : 'É possível registrar quantos documentos forem necessários. O arquivo é opcional.'
      }
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
          {document ? 'Substituir arquivo (opcional)' : 'Arquivo (opcional)'}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          {document?.originalName && !file && (
            <small>Arquivo atual: {document.originalName}</small>
          )}
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
            {saving ? 'Salvando...' : document ? 'Salvar alterações' : 'Adicionar documento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function WorksPage() {
  const { can } = useSession();
  const [searchParams] = useSearchParams();
  const canManage = can('works.manage');
  const canDocuments = can('works.documents_view');
  const [stores, setStores] = useState<Store[]>([]);
  const [services, setServices] = useState<WorkService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const referenceFilter = useMemo(
    () => (searchParams.get('refs') || '').split(',').map((value) => value.trim()).filter(Boolean),
    [searchParams],
  );
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [stateFilter, setStateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [serviceModal, setServiceModal] = useState<WorkService | 'new' | null>(null);
  const [paymentEditor, setPaymentEditor] = useState<{
    service: WorkService;
    payment: WorkServicePayment | null;
  } | null>(null);
  const [documentEditor, setDocumentEditor] = useState<{
    service: WorkService;
    document: WorkServiceDocument | null;
  } | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [expandedServiceIds, setExpandedServiceIds] = useState<Set<string>>(() => new Set());

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
      .filter((service) => !referenceFilter.length || referenceFilter.includes(service.code))
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
  }, [query, referenceFilter, services, stateFilter, storeFilter]);

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

  const allFilteredExpanded =
    filtered.length > 0 && filtered.every((service) => expandedServiceIds.has(service.id));

  const toggleAllServices = () => {
    setExpandedServiceIds((current) => {
      const next = new Set(current);
      if (allFilteredExpanded) {
        filtered.forEach((service) => next.delete(service.id));
      } else {
        filtered.forEach((service) => next.add(service.id));
      }
      return next;
    });
  };

  const openDocument = async (service: WorkService, documentId: string) => {
    if (!canDocuments) return;
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

  const removeDocument = async (document: WorkServiceDocument) => {
    if (!canManage) return;
    const label = `${DOCUMENT_LABELS[document.documentType]}${document.documentNumber ? ` · ${document.documentNumber}` : ''}`;
    if (!window.confirm(`Excluir ${label}? O registro e o arquivo anexado serão removidos.`)) return;

    setDeletingDocumentId(document.id);
    setError(null);
    try {
      await deleteWorkDocument(document);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Não foi possível excluir o documento.'));
      await load();
    } finally {
      setDeletingDocumentId(null);
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

      <section className="works-kpis works-kpis--grouped">
        <div className="works-kpi-group works-kpi-group--budget">
          <span className="works-kpi-group__title">Planejamento</span>
          <div>
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
          </div>
        </div>
        <div className="works-kpi-group works-kpi-group--cash">
          <span className="works-kpi-group__title">Financeiro</span>
          <div>
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
          </div>
        </div>
        <div className="works-kpi-group works-kpi-group--documents">
          <span className="works-kpi-group__title">Documentação</span>
          <div>
            <article className={totals.missingDocumentsCents > 0n ? 'works-kpi--warning' : 'works-kpi--ok'}>
              <ReceiptText size={21} />
              <span>Falta documentar</span>
              <strong>{formatBRL(totals.missingDocumentsCents)}</strong>
            </article>
          </div>
        </div>
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
            <div className="works-list__actions">
              <span>{filtered.length} serviço(s)</span>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={toggleAllServices}
              >
                <ChevronsUpDown size={15} />
                {allFilteredExpanded ? 'Recolher todos os serviços' : 'Expandir todos os serviços'}
              </button>
            </div>
          </header>
          {filtered.map((service) => {
            const current = serviceTotals(service);
            return (
              <details
                className="works-card"
                key={service.id}
                open={expandedServiceIds.has(service.id)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setExpandedServiceIds((currentIds) => {
                    const next = new Set(currentIds);
                    if (isOpen) next.add(service.id);
                    else next.delete(service.id);
                    return next;
                  });
                }}
              >
                <summary>
                  <div className="works-card__identity">
                    <span>{service.code}</span>
                    <strong>{service.description}</strong>
                    <small>
                      {service.storeCode} · {service.storeName} · {service.storeCity}/{service.storeState}
                    </small>
                  </div>
                  <div>
                    <span>Contratado / orçado</span>
                    <strong>{formatBRL(current.contractedCents)}</strong>
                    <small>{formatBRL(current.budgetCents)} orçado</small>
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

                  {service.components.length > 0 && (
                    <section className="works-detail-block works-components-block">
                      <header>
                        <div>
                          <HardHat size={17} />
                          <strong>Serviços discriminados</strong>
                          <span>Composição do valor contratado.</span>
                        </div>
                      </header>
                      <div className="works-components-view">
                        {service.components.map((component) => (
                          <div key={component.id}>
                            <strong>{component.category}</strong>
                            <span>{component.description || 'Sem descrição adicional'}</span>
                            <strong>{formatBRL(moneyToCents(component.amount))}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

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
                          onClick={() => setPaymentEditor({ service, payment: null })}
                        >
                          <Plus size={15} />
                          Pagamento/Parcelamento
                        </button>
                      )}
                    </header>
                    {service.payments.length ? (
                      <div
                        className={`works-mini-table${canManage ? ' works-mini-table--editable' : ''}`}
                      >
                        <div className="works-mini-table__header">
                          <span>Parcela</span>
                          <span>Vencimento</span>
                          <span>Valor</span>
                          <span>Forma</span>
                          <span>Situação</span>
                          {canManage && <span>Ações</span>}
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
                            {canManage && (
                              <button
                                type="button"
                                className="button button--secondary button--small"
                                onClick={() => setPaymentEditor({ service, payment })}
                              >
                                <Pencil size={14} />
                                Editar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="works-empty-line">Nenhum pagamento cadastrado.</p>
                    )}
                  </section>

                  {canDocuments && (
                    <section className="works-detail-block">
                      <header>
                        <div>
                          <ReceiptText size={17} />
                          <strong>Orçamentos, notas e recibos</strong>
                          <span>Um serviço pode possuir vários documentos e anexos.</span>
                        </div>
                        {canManage && (
                          <button
                            className="button button--secondary button--small"
                            onClick={() => setDocumentEditor({ service, document: null })}
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
                                  {document.status === 'verified'
                                    ? 'Conferido'
                                    : 'Pendente de conferência'}
                                  {document.paymentId ? ' · vinculado a pagamento' : ''}
                                </small>
                              </div>
                              <div className="works-document-actions">
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
                                {canManage && (
                                  <>
                                    <button
                                      type="button"
                                      className="button button--secondary button--small"
                                      onClick={() => setDocumentEditor({ service, document })}
                                    >
                                      <Pencil size={14} />
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className="button button--secondary button--small works-document-delete"
                                      disabled={deletingDocumentId === document.id}
                                      onClick={() => void removeDocument(document)}
                                    >
                                      <Trash2 size={14} />
                                      {deletingDocumentId === document.id ? 'Excluindo...' : 'Excluir'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="works-empty-line">Nenhum documento cadastrado.</p>
                      )}
                    </section>
                  )}
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
      {paymentEditor && (
        <WorkPaymentModal
          key={`${paymentEditor.service.id}-${paymentEditor.payment?.id || 'new'}`}
          service={paymentEditor.service}
          payment={paymentEditor.payment}
          onClose={() => setPaymentEditor(null)}
          onSaved={load}
        />
      )}
      {canDocuments && documentEditor && (
        <WorkDocumentModal
          key={`${documentEditor.service.id}-${documentEditor.document?.id || 'new'}`}
          service={documentEditor.service}
          document={documentEditor.document}
          onClose={() => setDocumentEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
