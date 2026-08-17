import { useEffect, useState, type FormEvent } from 'react';
import { createSupplyItem, updateSupplyItem } from '../data/supplies/supplies-repository';
import { SUPPLY_CATEGORIES } from '../domain/supply-options';
import type { SupplyItem, SupplyItemValues } from '../domain/types';
import { Modal } from './ui';

const EMPTY_ITEM: SupplyItemValues = {
  name: '',
  description: '',
  category: '',
  subcategory: '',
  groupName: '',
  areaName: '',
  type: 'product',
  defaultUnit: 'un',
  defaultQuantity: '',
  brandReference: '',
  technicalSpecification: '',
  productLink: '',
  active: true,
};

function valuesFromItem(item: SupplyItem): SupplyItemValues {
  return {
    name: item.name,
    description: item.description || '',
    category: item.category,
    subcategory: item.subcategory || '',
    groupName: item.groupName || '',
    areaName: item.areaName || '',
    type: item.type,
    defaultUnit: item.defaultUnit,
    defaultQuantity: item.defaultQuantity === null ? '' : String(item.defaultQuantity),
    brandReference: item.brandReference || '',
    technicalSpecification: item.technicalSpecification || '',
    productLink: item.productLink || '',
    active: item.active,
  };
}

export function SupplyItemFormModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: SupplyItem | null;
  onClose: () => void;
  onSaved: (saved: SupplyItem) => Promise<void> | void;
}) {
  const [values, setValues] = useState<SupplyItemValues>(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(item ? valuesFromItem(item) : EMPTY_ITEM);
    setError(null);
  }, [item, open]);

  const set = <K extends keyof SupplyItemValues>(key: K, value: SupplyItemValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim() || !values.category.trim() || !values.defaultUnit.trim()) {
      setError('Informe nome, categoria e unidade.');
      return;
    }
    if (values.defaultQuantity && Number(values.defaultQuantity) <= 0) {
      setError('A quantidade padrao deve ser maior que zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = item ? await updateSupplyItem(item.id, values) : await createSupplyItem(values);
      await onSaved(saved);
      onClose();
    } catch {
      setError('Nao foi possivel salvar o item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={item ? `Editar ${item.code}` : 'Novo item'}
      description="Catalogo global para necessidades e cotacoes."
      onClose={onClose}
      className="item-form-modal"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid form-grid--three">
          {item && (
            <label className="field">
              Codigo interno
              <input value={item.code} readOnly />
            </label>
          )}
          <label className={`field${item ? ' form-grid__span-two' : ' form-grid__wide'}`}>
            Nome
            <input
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={180}
              required
            />
          </label>
          <label className="field">
            Categoria
            <input
              list="supply-categories"
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
              maxLength={100}
              required
            />
            <datalist id="supply-categories">
              {SUPPLY_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Grupo
            <input
              value={values.groupName}
              onChange={(event) => set('groupName', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="field">
            Area
            <input
              value={values.areaName}
              onChange={(event) => set('areaName', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="field">
            Subcategoria
            <input
              value={values.subcategory}
              onChange={(event) => set('subcategory', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="field">
            Tipo
            <select
              value={values.type}
              onChange={(event) => set('type', event.target.value as SupplyItemValues['type'])}
            >
              <option value="product">Produto</option>
              <option value="service">Servico</option>
            </select>
          </label>
          <label className="field">
            Unidade
            <input
              value={values.defaultUnit}
              onChange={(event) => set('defaultUnit', event.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label className="field">
            Quantidade padrao
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={values.defaultQuantity}
              onChange={(event) => set('defaultQuantity', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Marca / referencia
            <input
              value={values.brandReference}
              onChange={(event) => set('brandReference', event.target.value)}
              maxLength={180}
            />
          </label>
          <label className="field form-grid__wide">
            Link do produto
            <input
              type="url"
              placeholder="https://"
              value={values.productLink}
              onChange={(event) => set('productLink', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Descricao
            <textarea
              rows={2}
              maxLength={3000}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
          <label className="field form-grid__wide">
            Notas tecnicas
            <textarea
              rows={3}
              maxLength={5000}
              value={values.technicalSpecification}
              onChange={(event) => set('technicalSpecification', event.target.value)}
            />
          </label>
          <label className="toggle-field form-grid__wide">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => set('active', event.target.checked)}
            />
            <span>
              <strong>Item ativo</strong>
              <small>Itens inativos permanecem no historico e saem de novos vinculos.</small>
            </span>
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
