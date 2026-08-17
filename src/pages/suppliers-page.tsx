import { Edit3, Mail, MapPin, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../app/session-provider';
import {
  EmptyState,
  ErrorState,
  IconButton,
  InlineLoading,
  Modal,
  StatusBadge,
} from '../components/ui';
import { listSuppliers, saveSupplier } from '../data/supplies/supplies-repository';
import { BRAZIL_STATES, SUPPLIER_CHANNEL_LABELS } from '../domain/supply-options';
import type { Supplier, SupplierChannelType, SupplierValues } from '../domain/types';

const EMPTY_SUPPLIER: SupplierValues = {
  id: null,
  tradeName: '',
  legalName: '',
  personType: 'legal',
  document: '',
  contactName: '',
  phone: '',
  email: '',
  website: '',
  city: '',
  state: '',
  address: '',
  notes: '',
  active: true,
  channelId: null,
  channelType: 'local_city',
  channelLabel: '',
  channelCity: '',
  channelState: '',
  servesNationally: false,
  channelActive: true,
};

function supplierValues(supplier: Supplier | null): SupplierValues {
  if (!supplier) return EMPTY_SUPPLIER;
  const channel = supplier.channels[0];
  return {
    id: supplier.id,
    tradeName: supplier.tradeName,
    legalName: supplier.legalName || '',
    personType: supplier.personType,
    document: supplier.document || '',
    contactName: supplier.contactName || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    website: supplier.website || '',
    city: supplier.city || '',
    state: supplier.state || '',
    address: supplier.address || '',
    notes: supplier.notes || '',
    active: supplier.active,
    channelId: channel?.id || null,
    channelType: channel?.type || 'local_city',
    channelLabel: channel?.label || '',
    channelCity: channel?.city || '',
    channelState: channel?.state || '',
    servesNationally: channel?.servesNationally || false,
    channelActive: channel?.active ?? true,
  };
}

function SupplierModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setValues(supplierValues(supplier));
    setError(null);
  }, [open, supplier]);
  const set = <K extends keyof SupplierValues>(key: K, value: SupplierValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.tradeName.trim()) {
      setError('Informe o nome fantasia.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSupplier(values);
      await onSaved();
      onClose();
    } catch {
      setError('Nao foi possivel salvar o fornecedor. Verifique documento, canal e localidade.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      title={supplier ? `Editar ${supplier.code}` : 'Novo fornecedor'}
      description="Cadastro e canal principal de atendimento."
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field form-grid__wide">
            Nome fantasia
            <input
              value={values.tradeName}
              onChange={(event) => set('tradeName', event.target.value)}
              required
            />
          </label>
          <label className="field form-grid__wide">
            Razao social
            <input
              value={values.legalName}
              onChange={(event) => set('legalName', event.target.value)}
            />
          </label>
          <label className="field">
            Tipo de pessoa
            <select
              value={values.personType}
              onChange={(event) =>
                set('personType', event.target.value as SupplierValues['personType'])
              }
            >
              <option value="legal">Juridica</option>
              <option value="individual">Fisica</option>
            </select>
          </label>
          <label className="field">
            Documento
            <input
              value={values.document}
              onChange={(event) => set('document', event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            Contato
            <input
              value={values.contactName}
              onChange={(event) => set('contactName', event.target.value)}
            />
          </label>
          <label className="field">
            Telefone
            <input value={values.phone} onChange={(event) => set('phone', event.target.value)} />
          </label>
          <label className="field">
            E-mail
            <input
              type="email"
              value={values.email}
              onChange={(event) => set('email', event.target.value)}
            />
          </label>
          <label className="field">
            Site
            <input
              type="url"
              value={values.website}
              onChange={(event) => set('website', event.target.value)}
              placeholder="https://"
            />
          </label>
          <label className="field">
            Cidade
            <input value={values.city} onChange={(event) => set('city', event.target.value)} />
          </label>
          <label className="field">
            UF
            <select value={values.state} onChange={(event) => set('state', event.target.value)}>
              <option value="">Nao informada</option>
              {BRAZIL_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="field form-grid__wide">
            Endereco
            <input
              value={values.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </label>
        </div>
        <fieldset className="form-fieldset">
          <legend>Canal principal</legend>
          <div className="form-grid">
            <label className="field">
              Origem / canal
              <select
                value={values.channelType}
                onChange={(event) => set('channelType', event.target.value as SupplierChannelType)}
              >
                {Object.entries(SUPPLIER_CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Identificacao
              <input
                value={values.channelLabel}
                onChange={(event) => set('channelLabel', event.target.value)}
                placeholder="Loja online, filial centro..."
              />
            </label>
            <label className="field">
              Cidade de origem
              <input
                value={values.channelCity}
                onChange={(event) => set('channelCity', event.target.value)}
              />
            </label>
            <label className="field">
              UF de origem
              <select
                value={values.channelState}
                onChange={(event) => set('channelState', event.target.value)}
              >
                <option value="">Nao informada</option>
                {BRAZIL_STATES.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={values.servesNationally}
                onChange={(event) => set('servesNationally', event.target.checked)}
              />
              <span>
                <strong>Cobertura nacional</strong>
                <small>Atende lojas em todo o pais.</small>
              </span>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={values.channelActive}
                onChange={(event) => set('channelActive', event.target.checked)}
              />
              <span>
                <strong>Canal ativo</strong>
                <small>Disponivel para cotacoes.</small>
              </span>
            </label>
          </div>
        </fieldset>
        <label className="field">
          Observacoes
          <textarea
            rows={3}
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) => set('active', event.target.checked)}
          />
          <span>
            <strong>Fornecedor ativo</strong>
            <small>Fornecedores inativos permanecem no historico.</small>
          </span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar fornecedor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
    : 'Sem cotacoes';
}

export function SuppliersPage() {
  const { can } = useSession();
  const canManage = can('suppliers.manage');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [channel, setChannel] = useState('');
  const [active, setActive] = useState('active');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSuppliers(await listSuppliers(canManage));
    } catch {
      setError('Nao foi possivel carregar os fornecedores.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return suppliers.filter(
      (supplier) =>
        (!search ||
          [
            supplier.code,
            supplier.tradeName,
            supplier.legalName || '',
            supplier.city || '',
            supplier.state || '',
          ]
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(search)) &&
        (!state ||
          supplier.state === state ||
          supplier.channels.some((entry) => entry.state === state)) &&
        (!channel || supplier.channels.some((entry) => entry.type === channel)) &&
        (active === 'all' || supplier.active === (active === 'active')),
    );
  }, [active, channel, query, state, suppliers]);
  const states = [
    ...new Set(
      suppliers.flatMap(
        (supplier) =>
          [supplier.state, ...supplier.channels.map((entry) => entry.state)].filter(
            Boolean,
          ) as string[],
      ),
    ),
  ].sort();

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Suprimentos</p>
          <h2>Fornecedores</h2>
          <p>Empresas, profissionais e canais disponiveis para cotacao.</p>
        </div>
        <div className="page-heading__actions">
          <div className="summary-number">
            <strong>{suppliers.filter((supplier) => supplier.active).length}</strong>
            <span>ativos</span>
          </div>
          {canManage && (
            <button
              className="button button--primary"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus size={18} />
              Novo fornecedor
            </button>
          )}
        </div>
      </header>
      <div className="supply-filter-grid supply-filter-grid--compact">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar fornecedores"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nome, codigo ou cidade"
          />
        </label>
        <select
          aria-label="Filtrar UF"
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="">Todas UFs</option>
          {states.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar canal"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="">Todos canais</option>
          {Object.entries(SUPPLIER_CHANNEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar situacao"
          value={active}
          onChange={(event) => setActive(event.target.value)}
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {loading ? (
        <InlineLoading label="Carregando fornecedores" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length ? (
        <div className="supplier-list">
          <div className="supplier-list__header">
            <span>Fornecedor</span>
            <span>Localidade</span>
            <span>Canais</span>
            <span>Contato</span>
            <span>Ultima cotacao</span>
            <span>Situacao</span>
            <span />
          </div>
          {filtered.map((supplier) => (
            <article className="supplier-row" key={supplier.id}>
              <div className="supply-identity">
                <small>{supplier.code}</small>
                <strong>{supplier.tradeName}</strong>
                <span>{supplier.personType === 'legal' ? 'Pessoa juridica' : 'Pessoa fisica'}</span>
              </div>
              <span className="supplier-meta">
                <MapPin size={15} />
                {supplier.city
                  ? `${supplier.city}${supplier.state ? ` / ${supplier.state}` : ''}`
                  : 'Nao informada'}
              </span>
              <div className="channel-tags">
                {supplier.channels.map((entry) => (
                  <span key={entry.id}>{SUPPLIER_CHANNEL_LABELS[entry.type]}</span>
                ))}
              </div>
              <span className="supplier-meta">
                <Mail size={15} />
                {supplier.email || supplier.phone || supplier.contactName || 'Nao informado'}
              </span>
              <span>{formatDate(supplier.latestQuoteDate)}</span>
              <StatusBadge status={supplier.active ? 'active' : 'inactive'} />
              {canManage ? (
                <IconButton
                  label={`Editar ${supplier.tradeName}`}
                  onClick={() => {
                    setEditing(supplier);
                    setModalOpen(true);
                  }}
                >
                  <Edit3 size={17} />
                </IconButton>
              ) : (
                <span />
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum fornecedor encontrado"
          detail="Ajuste os filtros ou cadastre um novo fornecedor."
        />
      )}
      <SupplierModal
        open={modalOpen}
        supplier={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </section>
  );
}
