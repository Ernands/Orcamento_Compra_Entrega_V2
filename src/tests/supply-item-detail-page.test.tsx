import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { getSupplyItemDetail } from '../data/supplies/supplies-repository';
import type { SupplyItemDetail } from '../domain/types';
import { SupplyItemDetailPage } from '../pages/supply-item-detail-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  createSupplyItem: vi.fn(),
  getSupplyItemDetail: vi.fn(),
  updateSupplyItem: vi.fn(),
}));

const detail: SupplyItemDetail = {
  item: {
    id: 'item-1',
    code: 'ITM-0001',
    name: 'Cadeira de atendimento',
    description: 'Modelo padrao para lojas',
    category: 'Mobiliario',
    subcategory: 'Cadeiras',
    groupName: 'Atendimento',
    areaName: 'Loja',
    type: 'product',
    defaultUnit: 'un',
    defaultQuantity: 4,
    brandReference: 'Modelo A',
    technicalSpecification: 'Estrutura reforcada',
    productLink: 'https://example.com/cadeira',
    active: true,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-17T10:00:00Z',
  },
  needs: [
    {
      id: 'need-1',
      storeId: 'store-1',
      storeCode: 'LOJ-001',
      storeName: 'Loja Um',
      storeCity: 'Campinas',
      storeState: 'SP',
      title: 'Cadeiras do salao',
      description: null,
      category: 'Mobiliario',
      quantity: 8,
      unit: 'un',
      priority: 'normal',
      status: 'identified',
      notes: null,
      origin: 'manual',
      sourceImplementationItemId: null,
      supplyItemId: 'item-1',
      createdAt: '',
    },
  ],
  quoteUsages: [
    {
      id: 'line-1',
      quoteId: 'quote-1',
      quoteCode: 'COT-00001',
      supplierName: 'Fornecedor Um',
      status: 'received',
      quoteDate: '2026-08-17',
      quantity: 8,
      unit: 'un',
      unitPrice: 199.9,
    },
  ],
};

describe('SupplyItemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ can: () => false } as never);
    vi.mocked(getSupplyItemDetail).mockResolvedValue(detail);
  });

  it('exibe cadastro, datas e usos acessiveis sem liberar edicao', async () => {
    render(
      <MemoryRouter initialEntries={['/suprimentos/itens/item-1']}>
        <Routes>
          <Route path="/suprimentos/itens/:itemId" element={<SupplyItemDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Cadeira de atendimento' }),
    ).toBeInTheDocument();
    expect(getSupplyItemDetail).toHaveBeenCalledWith('item-1');
    expect(screen.getByText('Estrutura reforcada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir link do produto' })).toHaveAttribute(
      'href',
      'https://example.com/cadeira',
    );
    expect(screen.getByText('Cadeiras do salao')).toBeInTheDocument();
    expect(screen.getByText('COT-00001')).toBeInTheDocument();
    expect(screen.getByText('Fornecedor Um')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });
});
