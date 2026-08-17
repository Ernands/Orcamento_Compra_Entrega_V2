import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  linkNeedToSupplyItem,
  listSupplyItems,
  listSupplyNeeds,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed } from '../domain/types';
import { SupplyNeedsPage } from '../pages/supply-needs-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  linkNeedToSupplyItem: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
}));

const item: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira',
  description: null,
  category: 'Mobiliario',
  subcategory: null,
  groupName: 'Atendimento',
  areaName: 'Loja',
  type: 'product',
  defaultUnit: 'un',
  defaultQuantity: 4,
  brandReference: null,
  technicalSpecification: null,
  productLink: null,
  active: true,
  createdAt: '',
  updatedAt: '',
};

const needs: SupplyNeed[] = [
  {
    id: 'need-linked',
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
    status: 'under_review',
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId: item.id,
    createdAt: '',
  },
  {
    id: 'need-unlinked',
    storeId: 'store-2',
    storeCode: 'LOJ-002',
    storeName: 'Loja Dois',
    storeCity: 'Niteroi',
    storeState: 'RJ',
    title: 'Balcao de recepcao',
    description: null,
    category: 'Mobiliario',
    quantity: 1,
    unit: 'un',
    priority: 'critical',
    status: 'identified',
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId: null,
    createdAt: '',
  },
];

describe('SupplyNeedsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyItems).mockResolvedValue([item]);
    vi.mocked(listSupplyNeeds).mockResolvedValue(needs);
    vi.mocked(linkNeedToSupplyItem).mockResolvedValue();
  });

  it('prioriza necessidades sem item e permite vincular o catalogo', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SupplyNeedsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Balcao de recepcao')).toBeInTheDocument();
    expect(screen.queryByText('Cadeiras do salao')).not.toBeInTheDocument();
    expect(
      screen.getByText('Demandas das lojas acessiveis, separadas do catalogo global de itens.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar vinculo'), '');
    expect(screen.getByText('Cadeiras do salao')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ITM-0001 - Cadeira' })).toHaveAttribute(
      'href',
      '/suprimentos/itens/item-1',
    );

    const unlinkedRow = screen.getByText('Balcao de recepcao').closest('article');
    await user.click(within(unlinkedRow!).getByRole('button', { name: 'Vincular' }));
    const dialog = screen.getByRole('dialog', { name: 'Vincular item' });
    await user.selectOptions(within(dialog).getByLabelText('Item do catalogo'), item.id);
    await user.click(within(dialog).getByRole('button', { name: 'Vincular' }));

    expect(linkNeedToSupplyItem).toHaveBeenCalledWith('need-unlinked', item.id);
  });

  it('oculta a acao de vinculo sem needs.edit', async () => {
    vi.mocked(useSession).mockReturnValue({ can: () => false } as never);
    render(
      <MemoryRouter>
        <SupplyNeedsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Balcao de recepcao')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular' })).not.toBeInTheDocument();
  });
});
