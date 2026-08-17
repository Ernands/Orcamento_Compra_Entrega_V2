import { useEffect, useState, type FormEvent } from 'react';
import type { ResponsibleUser, Store, StoreFormValues } from '../domain/types';
import { Modal } from './ui';

const STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

const EMPTY_VALUES: StoreFormValues = {
  name: '',
  city: '',
  state: '',
  address: '',
  responsibleUserId: '',
  status: 'planning',
  plannedOpeningDate: '',
  notes: '',
};

function valuesFromStore(store: Store | null): StoreFormValues {
  if (!store) return EMPTY_VALUES;
  return {
    name: store.name,
    city: store.city,
    state: store.state,
    address: store.address || '',
    responsibleUserId: store.responsibleUserId || '',
    status: store.status,
    plannedOpeningDate: store.plannedOpeningDate || '',
    notes: store.notes || '',
  };
}

interface StoreFormModalProps {
  open: boolean;
  store?: Store | null;
  responsibleUsers: ResponsibleUser[];
  onClose: () => void;
  onSave: (values: StoreFormValues) => Promise<void>;
}

export function StoreFormModal({
  open,
  store = null,
  responsibleUsers,
  onClose,
  onSave,
}: StoreFormModalProps) {
  const [values, setValues] = useState<StoreFormValues>(valuesFromStore(store));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(valuesFromStore(store));
      setError(null);
    }
  }, [open, store]);

  const set = <K extends keyof StoreFormValues>(key: K, value: StoreFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim() || !values.city.trim() || !values.state) {
      setError('Preencha nome, cidade e UF.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch {
      setError('Nao foi possivel salvar a loja. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={store ? 'Editar loja' : 'Nova loja'}
      description="O codigo da loja e gerado automaticamente pelo banco."
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          Codigo
          <input value={store?.code || 'Gerado ao salvar'} readOnly disabled />
        </label>
        <div className="form-grid">
          <label className="field form-grid__wide">
            Nome
            <input
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="field">
            Cidade
            <input
              value={values.city}
              onChange={(event) => set('city', event.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            UF
            <select
              value={values.state}
              onChange={(event) => set('state', event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="field form-grid__wide">
            Endereco
            <input
              value={values.address}
              onChange={(event) => set('address', event.target.value)}
              maxLength={300}
            />
          </label>
          <label className="field">
            Responsavel
            <select
              value={values.responsibleUserId}
              onChange={(event) => set('responsibleUserId', event.target.value)}
            >
              <option value="">Sem responsavel</option>
              {responsibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Status
            <select
              value={values.status}
              onChange={(event) => set('status', event.target.value as Store['status'])}
            >
              <option value="planning">Planejamento</option>
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </select>
          </label>
          <label className="field">
            Inauguracao planejada
            <input
              type="date"
              value={values.plannedOpeningDate}
              onChange={(event) => set('plannedOpeningDate', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Observacoes
            <textarea
              rows={3}
              value={values.notes}
              onChange={(event) => set('notes', event.target.value)}
              maxLength={2000}
            />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="button button--secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar loja'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
