import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  createSupplyItem,
  linkNeedToSupplyItem,
  listSupplyItems,
  listSupplyNeeds,
  updateSupplyItem,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed } from '../domain/types';
import { SupplyItemsPage } from '../pages/supply-items-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  createSupplyItem: vi.fn(),
  linkNeedToSupplyItem: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  updateSupplyItem: vi.fn(),
}));

const item: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira de atendimento',
  description: null,
  category: 'Mobiliario',
  subcategory: null,
  type: 'product',
  defaultUnit: 'un',
  brandReference: null,
  technicalSpecification: null,
  active: true,
  createdAt: '2026-08-17T00:00:00Z',
  updatedAt: '2026-08-17T00:00:00Z',
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
    quantity: 10,
    unit: 'un',
    priority: 'high',
    status: 'identified',
    notes: null,
    origin: 'manual',
    sourceImplementationItemId: null,
    supplyItemId: item.id,
    createdAt: '2026-08-17T00:00:00Z',
  },
  {
    id: 'need-2',
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
    createdAt: '2026-08-17T00:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplyItemsPage />
    </MemoryRouter>,
  );
}

describe('SupplyItemsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyItems).mockResolvedValue([item]);
    vi.mocked(listSupplyNeeds).mockResolvedValue(needs);
    vi.mocked(createSupplyItem).mockResolvedValue(item);
    vi.mocked(updateSupplyItem).mockResolvedValue(item);
    vi.mocked(linkNeedToSupplyItem).mockResolvedValue();
  });

  it('lista, consolida e filtra necessidades sem item', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Cadeira de atendimento')).toBeInTheDocument();
    expect(screen.getByText('10 un')).toBeInTheDocument();
    expect(screen.getByText('Balcao de recepcao')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Somente sem item' }));
    expect(screen.queryByText('Cadeira de atendimento')).not.toBeInTheDocument();
    expect(screen.getByText('Balcao de recepcao')).toBeInTheDocument();
  });

  it('cadastra e edita um item quando items.manage esta liberada', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Novo item' }));
    await user.type(screen.getByLabelText('Nome'), 'Notebook');
    await user.type(screen.getByLabelText('Categoria'), 'Informatica');
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));
    expect(createSupplyItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Notebook', category: 'Informatica' }),
    );

    await user.click(screen.getByRole('button', { name: 'Editar Cadeira de atendimento' }));
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Cadeira revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));
    expect(updateSupplyItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ name: 'Cadeira revisada' }),
    );
  });

  it('mantem Consulta em modo somente leitura', async () => {
    vi.mocked(useSession).mockReturnValue({
      can: (capability: string) => capability.endsWith('.view'),
    } as never);
    renderPage();
    expect(await screen.findByText('Cadeira de atendimento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo item' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar Cadeira de atendimento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular' })).not.toBeInTheDocument();
  });
});
