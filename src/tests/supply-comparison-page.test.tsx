import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed, SupplyQuote, SupplyQuoteItem } from '../domain/types';
import { SupplyComparisonPage } from '../pages/supply-comparison-page';

vi.mock('../data/supplies/supplies-repository', () => ({
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
}));

const catalogItem: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira',
  description: null,
  category: 'Mobiliario',
  subcategory: null,
  type: 'product',
  defaultUnit: 'un',
  brandReference: null,
  technicalSpecification: null,
  active: true,
  createdAt: '',
  updatedAt: '',
};
const needs: SupplyNeed[] = [
  {
    id: 'need-1',
    storeId: 'store-1',
    storeCode: 'LOJ-001',
    storeName: 'Loja Um',
    storeCity: 'Campinas',
    storeState: 'SP',
    title: 'Cadeiras',
    description: null,
    category: 'Mobiliario',
    quantity: 3,
    unit: 'un',
    priority: 'normal',
    status: 'identified',
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId: catalogItem.id,
    createdAt: '',
  },
  {
    id: 'need-2',
    storeId: 'store-2',
    storeCode: 'LOJ-002',
    storeName: 'Loja Dois',
    storeCity: 'Niteroi',
    storeState: 'RJ',
    title: 'Cadeiras',
    description: null,
    category: 'Mobiliario',
    quantity: 3,
    unit: 'un',
    priority: 'normal',
    status: 'identified',
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId: catalogItem.id,
    createdAt: '',
  },
];
function line(
  id: string,
  quoteId: string,
  storeIndex: number,
  unitPrice: string,
  shipping: string,
  days: number,
): SupplyQuoteItem {
  return {
    id,
    quoteId,
    supplyItemId: catalogItem.id,
    itemCode: catalogItem.code,
    itemName: catalogItem.name,
    storeNeedId: needs[storeIndex].id,
    needTitle: needs[storeIndex].title,
    storeId: needs[storeIndex].storeId,
    storeCode: needs[storeIndex].storeCode,
    storeName: needs[storeIndex].storeName,
    quantity: '3',
    unit: 'un',
    unitPrice,
    discountAmount: '0',
    shippingType: 'informed',
    shippingAmount: shipping,
    otherCosts: '0',
    deliveryDays: days,
    minimumQuantity: null,
    offeredBrandModel: null,
    notes: null,
    productUrl: null,
    capturedAt: null,
  };
}
const quotes: SupplyQuote[] = [
  {
    id: 'quote-1',
    code: 'COT-00001',
    supplierId: 'supplier-1',
    supplierName: 'Fornecedor Local',
    supplierChannelId: 'channel-1',
    channel: 'local_city',
    originCity: 'Campinas',
    originState: 'SP',
    quoteDate: '2026-08-17',
    validUntil: '2099-12-31',
    contact: null,
    contextType: 'store',
    status: 'received',
    notes: null,
    createdAt: '',
    stores: [{ id: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Campinas', state: 'SP' }],
    items: [line('line-1', 'quote-1', 0, '10', '20', 7)],
  },
  {
    id: 'quote-2',
    code: 'COT-00002',
    supplierId: 'supplier-2',
    supplierName: 'Fornecedor Web',
    supplierChannelId: 'channel-2',
    channel: 'ecommerce',
    originCity: null,
    originState: null,
    quoteDate: '2026-08-17',
    validUntil: '2099-12-31',
    contact: null,
    contextType: 'store',
    status: 'received',
    notes: null,
    createdAt: '',
    stores: [{ id: 'store-2', code: 'LOJ-002', name: 'Loja Dois', city: 'Niteroi', state: 'RJ' }],
    items: [line('line-2', 'quote-2', 1, '11', '0', 3)],
  },
];

describe('SupplyComparisonPage', () => {
  beforeEach(() => {
    vi.mocked(listSupplyQuotes).mockResolvedValue(quotes);
    vi.mocked(listSupplyItems).mockResolvedValue([catalogItem]);
    vi.mocked(listSupplyNeeds).mockResolvedValue(needs);
  });

  it('destaca menor preco unitario, menor custo e menor prazo separadamente', async () => {
    render(<SupplyComparisonPage />);
    expect(await screen.findByText('Fornecedor Local')).toBeInTheDocument();
    expect(screen.getByText('Menor preco')).toBeInTheDocument();
    expect(screen.getByText('Menor custo')).toBeInTheDocument();
    expect(screen.getAllByText('Menor prazo').length).toBeGreaterThan(1);
  });

  it('filtra alternativas pela loja', async () => {
    const user = userEvent.setup();
    render(<SupplyComparisonPage />);
    await screen.findByText('Fornecedor Local');
    await user.selectOptions(screen.getByLabelText('Filtrar loja no comparativo'), 'store-1');
    expect(screen.getByText('Fornecedor Local')).toBeInTheDocument();
    expect(screen.queryByText('Fornecedor Web')).not.toBeInTheDocument();
  });

  it('calcula destaques separadamente para itens diferentes', async () => {
    const otherItem: SupplyItem = {
      ...catalogItem,
      id: 'item-2',
      code: 'ITM-0002',
      name: 'Mesa',
    };
    const otherLine: SupplyQuoteItem = {
      ...line('line-3', 'quote-3', 0, '100', '0', 12),
      supplyItemId: otherItem.id,
      itemCode: otherItem.code,
      itemName: otherItem.name,
      storeNeedId: null,
      needTitle: null,
    };
    const otherQuote: SupplyQuote = {
      ...quotes[0],
      id: 'quote-3',
      code: 'COT-00003',
      supplierName: 'Fornecedor de Mesas',
      items: [otherLine],
    };
    vi.mocked(listSupplyItems).mockResolvedValue([catalogItem, otherItem]);
    vi.mocked(listSupplyQuotes).mockResolvedValue([...quotes, otherQuote]);

    render(<SupplyComparisonPage />);

    expect(await screen.findByText('Fornecedor de Mesas')).toBeInTheDocument();
    expect(screen.getAllByText('Menor preco')).toHaveLength(2);
  });

  it('compara somente cotacoes recebidas e ainda validas', async () => {
    const noValidity: SupplyQuote = {
      ...quotes[1],
      id: 'quote-no-validity',
      code: 'COT-00010',
      supplierName: 'Fornecedor sem validade',
      validUntil: null,
      items: [line('line-no-validity', 'quote-no-validity', 1, '12', '0', 2)],
    };
    const ineligible = [
      { id: 'quote-draft', supplierName: 'Fornecedor Draft', status: 'draft' as const },
      {
        id: 'quote-cancelled',
        supplierName: 'Fornecedor Cancelado',
        status: 'cancelled' as const,
      },
      { id: 'quote-expired', supplierName: 'Fornecedor Expirado', status: 'expired' as const },
      {
        id: 'quote-validity-expired',
        supplierName: 'Fornecedor Validade Vencida',
        status: 'received' as const,
        validUntil: '2000-01-01',
      },
    ].map((changes, index): SupplyQuote => ({
      ...quotes[0],
      ...changes,
      code: `COT-0002${index}`,
      validUntil: 'validUntil' in changes && changes.validUntil ? changes.validUntil : '2099-12-31',
      items: [line(`line-invalid-${index}`, changes.id, 0, '1', '0', 1)],
    }));
    vi.mocked(listSupplyQuotes).mockResolvedValue([quotes[0], noValidity, ...ineligible]);

    render(<SupplyComparisonPage />);

    const validSupplier = await screen.findByText('Fornecedor Local');
    const noValiditySupplier = screen.getByText('Fornecedor sem validade');
    expect(validSupplier).toBeInTheDocument();
    expect(noValiditySupplier).toBeInTheDocument();
    expect(screen.queryByText('Fornecedor Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Fornecedor Cancelado')).not.toBeInTheDocument();
    expect(screen.queryByText('Fornecedor Expirado')).not.toBeInTheDocument();
    expect(screen.queryByText('Fornecedor Validade Vencida')).not.toBeInTheDocument();
    expect(within(validSupplier.closest('article')!).getByText('Menor preco')).toBeInTheDocument();
    expect(
      within(noValiditySupplier.closest('article')!).getByText('Menor custo'),
    ).toBeInTheDocument();
    expect(
      within(noValiditySupplier.closest('article')!).getByText('Menor prazo'),
    ).toBeInTheDocument();
  });
});
