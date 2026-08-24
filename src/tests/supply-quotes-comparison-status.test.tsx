import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listSupplyQuoteAttachments } from '../data/attachments/quote-attachments-repository';
import {
  listStores,
} from '../data/stores/stores-repository';
import {
  listSuppliers,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../data/supplies/supplies-repository';
import { getGroupedComparisonHighlights } from '../domain/supply-comparison';
import type { SupplyQuote, SupplyQuoteStatus } from '../domain/types';
import { SupplyQuotesPage } from '../pages/supply-quotes-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/attachments/quote-attachments-repository', () => ({
  listSupplyQuoteAttachments: vi.fn(),
  createSupplyQuoteAttachmentSignedUrl: vi.fn(),
  deleteSupplyQuoteAttachment: vi.fn(),
  uploadSupplyQuoteAttachment: vi.fn(),
  validateQuoteAttachment: vi.fn(),
}));
vi.mock('../data/purchases/purchases-repository', () => ({
  approveSupplyQuoteForPurchase: vi.fn(),
}));
vi.mock('../data/purchases/quote-payment-terms-repository', () => ({
  EMPTY_QUOTE_PAYMENT_TERMS: {
    paymentMethod: '',
    entryAmount: '',
    installmentCount: '',
    paymentNotes: '',
  },
  getQuotePaymentTerms: vi.fn(),
  saveSupplyQuoteWithPaymentTerms: vi.fn(),
}));
vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  deleteSupplyQuote: vi.fn(),
  listSuppliers: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
  setSupplyQuoteStatus: vi.fn(),
}));
vi.mock('../domain/supply-comparison', () => ({
  getGroupedComparisonHighlights: vi.fn(() => ({
    lowestUnitPriceIds: new Set<string>(),
    lowestTotalIds: new Set<string>(),
    shortestLeadTimeIds: new Set<string>(),
  })),
}));

function quoteWithStatus(status: SupplyQuoteStatus): SupplyQuote {
  const id = `quote-${status}`;
  return {
    id,
    code: `COT-${status.toUpperCase()}`,
    supplierId: 'supplier-1',
    supplierName: `Fornecedor ${status}`,
    supplierChannelId: 'channel-1',
    channel: 'ecommerce',
    originCity: null,
    originState: null,
    quoteDate: '2026-08-24',
    validUntil: '2099-12-31',
    contact: null,
    contextType: 'consolidated',
    status,
    notes: null,
    createdAt: '2026-08-24T00:00:00Z',
    stores: [],
    items: [
      {
        id: `item-${status}`,
        quoteId: id,
        supplyItemId: 'supply-item-1',
        itemCode: 'ITM-0001',
        itemName: 'Cadeira',
        storeNeedId: null,
        needTitle: null,
        storeId: null,
        storeCode: null,
        storeName: null,
        quantity: '27',
        unit: 'un',
        unitPrice: status === 'cancelled' ? '1.00' : '10.00',
        discountAmount: '0.00',
        shippingType: 'free',
        shippingAmount: '0.00',
        otherCosts: '0.00',
        deliveryDays: status === 'cancelled' ? 1 : 5,
        minimumQuantity: null,
        offeredBrandModel: null,
        notes: null,
        productUrl: null,
        capturedAt: null,
      },
    ],
  };
}

describe('SupplyQuotesPage comparison statuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([]);
    vi.mocked(listSupplyItems).mockResolvedValue([]);
    vi.mocked(listSupplyNeeds).mockResolvedValue([]);
    vi.mocked(listSuppliers).mockResolvedValue([]);
    vi.mocked(listStores).mockResolvedValue([]);
  });

  it('compara rascunho, recebida e expirada e exclui cancelada dos destaques', async () => {
    vi.mocked(listSupplyQuotes).mockResolvedValue([
      quoteWithStatus('draft'),
      quoteWithStatus('received'),
      quoteWithStatus('expired'),
      quoteWithStatus('cancelled'),
    ]);

    render(
      <MemoryRouter>
        <SupplyQuotesPage />
      </MemoryRouter>,
    );

    await screen.findByText('COT-DRAFT');

    const dataCall = vi
      .mocked(getGroupedComparisonHighlights)
      .mock.calls.find(([items]) => items.length === 3);

    expect(dataCall).toBeDefined();
    expect(dataCall?.[0].map((item) => item.id).sort()).toEqual([
      'item-draft',
      'item-expired',
      'item-received',
    ]);
    expect(dataCall?.[0].some((item) => item.id === 'item-cancelled')).toBe(false);
  });
});
