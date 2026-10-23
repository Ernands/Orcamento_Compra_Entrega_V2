import type { UnifiedFinancePaymentRow } from './finance-payments';
import type { Store } from './types';

type StoreScope = Pick<UnifiedFinancePaymentRow, 'storeIds' | 'storeCodes' | 'states'>;
type StoreLocation = Pick<Store, 'code' | 'city' | 'state'>;

function locationLabels(row: StoreScope, storesById: ReadonlyMap<string, StoreLocation>): string[] {
  return row.storeIds.flatMap((id) => {
    const store = storesById.get(id);
    if (!store) return [];
    return [`${store.code} · ${store.city.trim() || 'Cidade não informada'}/${store.state || 'UF não informada'}`];
  });
}

/** Short, legible label on narrow payment cards, preserving code + city + UF. */
export function financePaymentStoreLabel(
  row: StoreScope,
  storesById: ReadonlyMap<string, StoreLocation>,
): string {
  const labels = locationLabels(row, storesById);
  if (labels.length === 1) return labels[0];
  if (labels.length > 1) {
    return `${labels.length} lojas · ${labels.slice(0, 2).join('; ')}${labels.length > 2 ? ` +${labels.length - 2} outras` : ''}`;
  }
  // Fallback for legacy payments whose store reference is no longer available.
  const code = row.storeCodes.length === 1 ? row.storeCodes[0] : null;
  const uf = row.states.join(', ') || 'UF não informada';
  if (code) return `${code} · ${uf}`;
  if (row.storeCodes.length > 1) return `${row.storeCodes.length} lojas · ${uf}`;
  if (row.storeIds.length) return `${row.storeIds.length} loja(s) · ${uf}`;
  return 'Sem loja definida';
}

/** Full store list for the tooltip when a payment covers multiple cities. */
export function financePaymentStoreTitle(
  row: StoreScope,
  storesById: ReadonlyMap<string, StoreLocation>,
): string {
  const labels = locationLabels(row, storesById);
  return labels.length ? labels.join(' | ') : financePaymentStoreLabel(row, storesById);
}
