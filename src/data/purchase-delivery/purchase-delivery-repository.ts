import { publicEnv } from '../../lib/env';
import type {
  PurchaseDeliveryCell,
  PurchaseDeliveryCellValues,
  PurchaseDeliveryDestination,
  PurchaseDeliveryDestinationValues,
  PurchaseDeliveryHeaderTone,
  PurchaseDeliveryItem,
  PurchaseDeliveryItemValues,
  PurchaseDeliveryMatrix,
  PurchaseDeliveryStatus,
} from '../../domain/purchase-delivery-types';
import { supabase } from '../supabase/client';
import { createRetryingFetch } from '../supabase/retry-fetch';

const retryingFetch = createRetryingFetch();

type DestinationRow = {
  id: string;
  label: string;
  keyword: string | null;
  is_video_service: boolean;
  header_tone: string;
  position: number;
  active: boolean;
  notes: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  purchase_total: number;
  acquired_quantity: number;
  position: number;
  active: boolean;
  notes: string | null;
};

type CellRow = {
  id: string;
  item_id: string;
  destination_id: string;
  quantity: number | null;
  status: string;
  note: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente no sistema.');

  const response = await retryingFetch(`${publicEnv.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publicEnv.supabasePublishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; details?: string } | null;
    throw new Error(payload?.message || payload?.details || `Falha na operação (${response.status}).`);
  }

  const body = await response.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

function destinationFromRow(row: DestinationRow): PurchaseDeliveryDestination {
  return {
    id: row.id,
    label: row.label,
    keyword: row.keyword,
    isVideoService: row.is_video_service,
    headerTone: row.header_tone as PurchaseDeliveryHeaderTone,
    position: row.position,
    active: row.active,
    notes: row.notes,
  };
}

function itemFromRow(row: ItemRow): PurchaseDeliveryItem {
  return {
    id: row.id,
    name: row.name,
    purchaseTotal: Number(row.purchase_total || 0),
    acquiredQuantity: Number(row.acquired_quantity || 0),
    position: row.position,
    active: row.active,
    notes: row.notes,
  };
}

function cellFromRow(row: CellRow): PurchaseDeliveryCell {
  return {
    id: row.id,
    itemId: row.item_id,
    destinationId: row.destination_id,
    quantity: row.quantity === null ? null : Number(row.quantity),
    status: row.status as PurchaseDeliveryStatus,
    note: row.note,
  };
}

export async function listPurchaseDeliveryMatrix(): Promise<PurchaseDeliveryMatrix> {
  const [destinations, items, cells] = await Promise.all([
    request<DestinationRow[]>('purchase_delivery_destinations?select=*&active=eq.true&order=position.asc,id.asc'),
    request<ItemRow[]>('purchase_delivery_items?select=*&active=eq.true&order=position.asc,id.asc'),
    request<CellRow[]>('purchase_delivery_cells?select=*'),
  ]);

  return {
    destinations: destinations.map(destinationFromRow),
    items: items.map(itemFromRow),
    cells: cells.map(cellFromRow),
  };
}

export async function savePurchaseDeliveryItem(
  item: PurchaseDeliveryItem | null,
  values: PurchaseDeliveryItemValues,
  position: number,
): Promise<void> {
  const payload = {
    name: values.name.trim(),
    purchase_total: values.purchaseTotal,
    acquired_quantity: values.acquiredQuantity,
    notes: values.notes.trim() || null,
    position,
    updated_at: new Date().toISOString(),
  };

  if (item) {
    await request(`purchase_delivery_items?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return;
  }

  await request('purchase_delivery_items', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseDeliveryItem(itemId: string): Promise<void> {
  await request(`purchase_delivery_items?id=eq.${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

export async function savePurchaseDeliveryDestination(
  destination: PurchaseDeliveryDestination | null,
  values: PurchaseDeliveryDestinationValues,
  position: number,
): Promise<void> {
  const payload = {
    label: values.label.trim(),
    keyword: values.keyword.trim() || null,
    is_video_service: values.isVideoService,
    header_tone: values.isVideoService ? values.headerTone : 'default',
    notes: values.notes.trim() || null,
    position,
    updated_at: new Date().toISOString(),
  };

  if (destination) {
    await request(`purchase_delivery_destinations?id=eq.${encodeURIComponent(destination.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return;
  }

  await request('purchase_delivery_destinations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseDeliveryDestination(destinationId: string): Promise<void> {
  await request(`purchase_delivery_destinations?id=eq.${encodeURIComponent(destinationId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

export async function savePurchaseDeliveryCell(
  current: PurchaseDeliveryCell | null,
  values: PurchaseDeliveryCellValues,
): Promise<void> {
  const empty = values.quantity === null && values.status === 'none' && !values.note.trim();
  if (empty) {
    if (current) await deletePurchaseDeliveryCell(current.id);
    return;
  }

  const payload = {
    item_id: values.itemId,
    destination_id: values.destinationId,
    quantity: values.quantity,
    status: values.status,
    note: values.note.trim() || null,
    updated_at: new Date().toISOString(),
  };

  await request('purchase_delivery_cells?on_conflict=item_id,destination_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseDeliveryCell(cellId: string): Promise<void> {
  await request(`purchase_delivery_cells?id=eq.${encodeURIComponent(cellId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}
