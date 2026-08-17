import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listSuppliers, saveSupplier } from '../data/supplies/supplies-repository';
import type { Supplier } from '../domain/types';
import { SuppliersPage } from '../pages/suppliers-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  listSuppliers: vi.fn(),
  saveSupplier: vi.fn(),
}));

const supplier: Supplier = {
  id: 'supplier-1',
  code: 'FOR-0001',
  tradeName: 'Fornecedor Campinas',
  legalName: null,
  personType: 'legal',
  document: null,
  contactName: 'Marina',
  phone: '11999990000',
  email: 'contato@example.invalid',
  website: null,
  city: 'Campinas',
  state: 'SP',
  address: null,
  notes: null,
  active: true,
  latestQuoteDate: null,
  channels: [
    {
      id: 'channel-1',
      supplierId: 'supplier-1',
      type: 'local_city',
      label: 'Centro',
      city: 'Campinas',
      state: 'SP',
      servesNationally: false,
      active: true,
    },
  ],
};

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSuppliers).mockResolvedValue([supplier]);
    vi.mocked(saveSupplier).mockResolvedValue(supplier.id);
  });

  it('lista e filtra fornecedores por canal', async () => {
    const user = userEvent.setup();
    render(<SuppliersPage />);
    expect(await screen.findByText('Fornecedor Campinas')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar canal'), 'ecommerce');
    expect(screen.queryByText('Fornecedor Campinas')).not.toBeInTheDocument();
  });

  it('cadastra e edita fornecedor com canal', async () => {
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(await screen.findByRole('button', { name: 'Novo fornecedor' }));
    await user.type(screen.getByLabelText('Nome fantasia'), 'Loja Web');
    await user.selectOptions(screen.getByLabelText('Origem / canal'), 'ecommerce');
    await user.click(screen.getByRole('button', { name: 'Salvar fornecedor' }));
    expect(saveSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ tradeName: 'Loja Web', channelType: 'ecommerce' }),
    );

    await user.click(screen.getByRole('button', { name: 'Editar Fornecedor Campinas' }));
    await user.clear(screen.getByLabelText('Nome fantasia'));
    await user.type(screen.getByLabelText('Nome fantasia'), 'Fornecedor Regional');
    await user.click(screen.getByRole('button', { name: 'Salvar fornecedor' }));
    expect(saveSupplier).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: supplier.id, tradeName: 'Fornecedor Regional' }),
    );
  });

  it('esconde comandos de gestao para Consulta', async () => {
    vi.mocked(useSession).mockReturnValue({
      can: (capability: string) => capability === 'suppliers.view',
    } as never);
    render(<SuppliersPage />);
    expect(await screen.findByText('Fornecedor Campinas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo fornecedor' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar Fornecedor Campinas' }),
    ).not.toBeInTheDocument();
  });
});
