import { purchaseOrderStoreCosts } from './purchase-v2-calculations';
import { moneyToCents, quantityToThousandths } from './supply-calculations';
import type { PurchaseV2 } from './purchase-v2-types';
import type { WorkService } from './works-types';
import type {
  AuditDocument,
  AuditDocumentLink,
  AuditRecord,
  AuditSystemItem,
} from './document-audit-types';

export const auditMoney = (value: string | null | undefined): bigint | null =>
  value === null || value === undefined || value.trim() === '' ? null : moneyToCents(value);

export function nullableSum(values: Array<bigint | null>): bigint | null {
  return values.some((value) => value === null)
    ? null
    : values.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
}

function subtotal(quantity: string, unitPrice: string): bigint {
  const value = quantityToThousandths(quantity) * moneyToCents(unitPrice);
  return value < 0n ? -((-value + 500n) / 1000n) : (value + 500n) / 1000n;
}

/** Existing attachment paths define known links; filenames/amounts never establish a link. */
function documentCatalog(
  purchases: PurchaseV2[],
  works: WorkService[],
): Map<string, AuditDocument> {
  const catalog = new Map<string, AuditDocument>();
  const add = (doc: Omit<AuditDocument, 'key' | 'links'>, link: AuditDocumentLink) => {
    const key = `${doc.source}:${doc.storagePath.trim() || `missing:${doc.id}`}`;
    const existing = catalog.get(key);
    if (existing) {
      if (
        !existing.links.some(
          (item) => item.recordId === link.recordId && item.orderId === link.orderId,
        )
      )
        existing.links.push(link);
    } else catalog.set(key, { ...doc, key, links: [link] });
  };
  purchases.forEach((purchase) =>
    purchase.attachments.forEach((doc) => {
      if (doc.documentType !== 'invoice' && doc.documentType !== 'receipt') return;
      add(
        {
          id: doc.id,
          source: 'purchase',
          type: doc.documentType,
          name: doc.originalName,
          number: doc.documentNumber,
          storagePath: doc.storagePath || '',
          mimeType: doc.mimeType,
          registeredAmount: doc.documentAmount,
          needsStoreReview: !doc.stores.length && purchase.stores.length > 1,
        },
        {
          recordId: `purchase:${purchase.id}`,
          reference: purchase.code,
          supplier: purchase.supplierName,
          storeIds: (doc.stores.length ? doc.stores : purchase.stores).map((item) => item.storeId),
          explicitStores: doc.stores.length > 0,
          orderId: doc.purchaseOrderId,
        },
      );
    }),
  );
  works.forEach((work) =>
    work.documents.forEach((doc) => {
      if (doc.documentType !== 'invoice' && doc.documentType !== 'receipt') return;
      add(
        {
          id: doc.id,
          source: 'work',
          type: doc.documentType,
          name: doc.originalName || doc.documentNumber || 'Documento',
          number: doc.documentNumber,
          storagePath: doc.storagePath || '',
          mimeType: doc.mimeType,
          registeredAmount: doc.documentAmount,
          needsStoreReview: false,
        },
        {
          recordId: `work:${work.id}`,
          reference: work.code,
          supplier: work.providerName || '',
          storeIds: [work.storeId],
          explicitStores: true,
          orderId: null,
        },
      );
    }),
  );
  // Matching registered number/supplier is a hint, never proof of the same fiscal document.
  const normalize = (value: string) => value.trim().toLocaleUpperCase('pt-BR');
  const documents = [...catalog.values()];
  documents.forEach((doc) => {
    if (!doc.number?.trim()) return;
    const own = new Set(doc.links.map((link) => link.recordId));
    const suppliers = new Set(doc.links.map((link) => normalize(link.supplier)).filter(Boolean));
    doc.possibleLinks = documents
      .filter(
        (other) =>
          other.key !== doc.key &&
          other.type === doc.type &&
          other.number &&
          normalize(other.number) === normalize(doc.number!) &&
          other.links.some((link) => suppliers.has(normalize(link.supplier))),
      )
      .flatMap((other) => other.links)
      .filter((link) => !own.has(link.recordId));
  });
  return catalog;
}

export function buildAuditRecords(
  storeId: string,
  purchases: PurchaseV2[],
  works: WorkService[],
): AuditRecord[] {
  const documents = [...documentCatalog(purchases, works).values()];
  const records: AuditRecord[] = [];
  purchases
    .filter((purchase) => purchase.stores.some((store) => store.storeId === storeId))
    .forEach((purchase) => {
      const id = `purchase:${purchase.id}`;
      const active = purchase.status !== 'cancelled' && purchase.status !== 'returned';
      const items: AuditSystemItem[] = purchase.orders.flatMap((order) => {
        const costs = purchaseOrderStoreCosts(order);
        return order.lines.map((line): AuditSystemItem => {
          const allocation = costs.rows
            .find((row) => row.storeId === storeId)
            ?.lines.find((entry) => entry.lineId === line.id);
          const confirmed = line.storeDistributionStatus === 'confirmed' && line.stores.length > 0;
          return {
            id: line.id,
            recordId: id,
            orderId: order.id,
            code: line.itemCode,
            description: line.itemName,
            quantity: line.quantity,
            storeQuantity: confirmed
              ? line.stores.find((store) => store.storeId === storeId)?.quantity || '0'
              : null,
            unit: line.unit,
            unitPrice: line.unitPrice,
            subtotalCents: subtotal(line.quantity, line.unitPrice),
            freightCents: auditMoney(line.shippingAmount),
            discountCents: auditMoney(line.discountAmount),
            otherCents: auditMoney(line.otherCosts),
            totalCents: auditMoney(line.lineTotal),
            storeCents: allocation?.costCents ?? (confirmed && line.lineTotal !== null ? 0n : null),
            storeIds: line.stores.map((store) => store.storeId),
            included: active && order.status === 'active',
            stage: !active
              ? `Compra ${purchase.status === 'returned' ? 'devolvida' : 'cancelada'}`
              : order.status === 'cancelled'
                ? 'Pedido cancelado'
                : 'Compra registrada',
          };
        });
      });
      // Preserve approved data for purchases without an order, without calling it an actual purchase.
      if (!purchase.orders.some((order) => order.status === 'active'))
        purchase.items.forEach((item) =>
          items.push({
            id: `approved:${item.id}`,
            recordId: id,
            orderId: null,
            code: item.itemCode,
            description: item.itemName,
            quantity: item.quantityApproved,
            storeQuantity: item.storeId === storeId ? item.quantityApproved : null,
            unit: item.unit,
            unitPrice: item.quotedUnitPrice,
            subtotalCents: subtotal(item.quantityApproved, item.quotedUnitPrice),
            freightCents: auditMoney(item.quotedShippingAmount),
            discountCents: auditMoney(item.quotedDiscountAmount),
            otherCents: auditMoney(item.quotedOtherCosts),
            totalCents: auditMoney(item.approvedLineTotal),
            storeCents: null,
            storeIds: item.storeId ? [item.storeId] : [],
            included: false,
            stage: 'Aprovado — sem compra ativa registrada',
          }),
        );
      const included = items.filter((item) => item.included);
      records.push({
        id,
        reference: purchase.code,
        source: 'purchase',
        supplier: purchase.supplierName,
        description: [...new Set(items.map((item) => item.description))].join('; '),
        status: purchase.status,
        active,
        storeIds: purchase.stores.map((store) => store.storeId),
        totalCents: !active
          ? 0n
          : included.length
            ? nullableSum(included.map((item) => item.totalCents))
            : null,
        storeCents: !active
          ? 0n
          : included.length
            ? nullableSum(included.map((item) => item.storeCents))
            : null,
        budgetCents: moneyToCents(purchase.approvedTotal),
        items,
        documents: documents.filter((doc) => doc.links.some((link) => link.recordId === id)),
      });
    });
  works
    .filter((work) => work.storeId === storeId)
    .forEach((work) => {
      const id = `work:${work.id}`;
      const active = work.status !== 'cancelled';
      const components = work.components.length
        ? work.components.map((component) => ({
            id: component.id,
            description: [component.category, component.description].filter(Boolean).join(' · '),
            amount: component.amount,
          }))
        : [{ id: work.id, description: work.description, amount: work.contractedAmount }];
      records.push({
        id,
        reference: work.code,
        source: 'work',
        supplier: work.providerName || '',
        description: work.description,
        status: work.status,
        active,
        storeIds: [work.storeId],
        totalCents: active ? moneyToCents(work.contractedAmount) : 0n,
        storeCents: active ? moneyToCents(work.contractedAmount) : 0n,
        budgetCents: moneyToCents(work.budgetAmount),
        items: components.map((component) => ({
          id: component.id,
          recordId: id,
          orderId: null,
          code: null,
          description: component.description,
          quantity: null,
          storeQuantity: null,
          unit: null,
          unitPrice: null,
          subtotalCents: null,
          freightCents: null,
          discountCents: null,
          otherCents: null,
          totalCents: moneyToCents(component.amount),
          storeCents: moneyToCents(component.amount),
          storeIds: [storeId],
          included: active,
          stage: active ? 'Componente/valor contratado' : 'Obra cancelada',
        })),
        documents: documents.filter((doc) => doc.links.some((link) => link.recordId === id)),
      });
    });
  return records.sort((a, b) => a.reference.localeCompare(b.reference, 'pt-BR'));
}
