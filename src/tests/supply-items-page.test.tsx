import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  createSupplyItem,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
  updateSupplyItem,
} from '../data/supplies/supplies-repository';
import type { SupplyItem, SupplyNeed } from '../domain/types';
import { SupplyItemsPage } from '../pages/supply-items-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  createSupplyItem: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
  updateSupplyItem: vi.fn(),
}));

const item: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira de atendimento',
  description: 'Cadeira para o salao',
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
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyItems).mockResolvedValue([item]);
    vi.mocked(listSupplyNeeds).mockResolvedValue(needs);
    vi.mocked(listSupplyQuotes).mockResolvedValue([]);
    vi.mocked(createSupplyItem).mockResolvedValue(item);
    vi.mocked(updateSupplyItem).mockResolvedValue(item);
  });

  it('lista e filtra o catalogo global com uso em necessidades', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Cadeira de atendimento')).toBeInTheDocument();
    expect(screen.getByText('Atendimento / Loja')).toBeInTheDocument();
    expect(screen.getByText('4 un')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir necessidades' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Cadeira de atendimento' })).toHaveAttribute(
      'href',
      '/suprimentos/itens/item-1',
    );

    await user.type(screen.getByLabelText('Buscar itens'), 'inexistente');
    expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
  });

  it('cadastra e edita todos os campos operacionais do item', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Novo item' }));
    await user.type(screen.getByLabelText('Nome'), 'Notebook');
    await user.type(screen.getByLabelText('Categoria'), 'Informatica');
    await user.type(screen.getByLabelText('Grupo'), 'Equipamentos');
    await user.type(screen.getByLabelText('Area'), 'Administrativo');
    await user.type(screen.getByLabelText('Quantidade padrao'), '2');
    await user.type(screen.getByLabelText('Link do produto'), 'https://example.com/notebook');
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));

    expect(createSupplyItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Notebook',
        category: 'Informatica',
        groupName: 'Equipamentos',
        areaName: 'Administrativo',
        defaultQuantity: '2',
        productLink: 'https://example.com/notebook',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Editar Cadeira de atendimento' }));
    expect(screen.getByLabelText('Codigo interno')).toHaveValue('ITM-0001');
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Cadeira revisada');
    await user.click(screen.getByRole('checkbox', { name: /Item ativo/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));

    expect(updateSupplyItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ name: 'Cadeira revisada', active: false }),
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
  });
});
