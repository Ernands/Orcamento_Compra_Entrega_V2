export type PurchaseDeliveryStatus =
  | 'none'
  | 'matrix'
  | 'purchased'
  | 'green_text'
  | 'delivered'
  | 'shipping_note'
  | 'orange_text'
  | 'attention'
  | 'issue'
  | 'do_not_buy';

export type PurchaseDeliveryHeaderTone = 'default' | 'video_dark' | 'video_light';

export interface PurchaseDeliveryDestination {
  id: string;
  label: string;
  keyword: string | null;
  isVideoService: boolean;
  headerTone: PurchaseDeliveryHeaderTone;
  position: number;
  active: boolean;
  notes: string | null;
}

export interface PurchaseDeliveryItem {
  id: string;
  name: string;
  purchaseTotal: number;
  acquiredQuantity: number;
  position: number;
  active: boolean;
  notes: string | null;
}

export interface PurchaseDeliveryCell {
  id: string;
  itemId: string;
  destinationId: string;
  quantity: number | null;
  status: PurchaseDeliveryStatus;
  note: string | null;
}

export interface PurchaseDeliveryMatrix {
  destinations: PurchaseDeliveryDestination[];
  items: PurchaseDeliveryItem[];
  cells: PurchaseDeliveryCell[];
}

export interface PurchaseDeliveryItemValues {
  name: string;
  purchaseTotal: number;
  acquiredQuantity: number;
  notes: string;
}

export interface PurchaseDeliveryDestinationValues {
  label: string;
  keyword: string;
  isVideoService: boolean;
  headerTone: PurchaseDeliveryHeaderTone;
  notes: string;
}

export interface PurchaseDeliveryCellValues {
  itemId: string;
  destinationId: string;
  quantity: number | null;
  status: PurchaseDeliveryStatus;
  note: string;
}

export function purchaseDeliveryPending(item: PurchaseDeliveryItem): number {
  return item.acquiredQuantity - item.purchaseTotal;
}

export const PURCHASE_DELIVERY_STATUS_LABELS: Record<PurchaseDeliveryStatus, string> = {
  none: 'Sem situação',
  matrix: 'Matriz / distribuir',
  purchased: 'Verde da planilha',
  green_text: 'Verde (texto)',
  delivered: 'Entregue',
  shipping_note: 'Envio com observação',
  orange_text: 'Laranja (texto)',
  attention: 'Atenção',
  issue: 'Alerta',
  do_not_buy: 'Não comprar',
};
