import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listSupplyQuoteAttachments } from '../data/attachments/quote-attachments-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  deleteSupplyQuote,
  listSuppliers,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
  saveSupplyQuote,
  setSupplyQuoteStatus,
} from '../data/supplies/supplies-repository';
import type {
  Store,
  Supplier,
  SupplyItem,
  SupplyNeed,
  SupplyQuote,
  SupplyQuoteAttachment,
  SupplyQuoteItem,
  SupplyQuoteStatus,
} from '../domain/types';
import { SupplyQuotesPage } from '../pages/supply-quotes-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/attachments/quote-attachments-repository', () => ({
  createSupplyQuoteAttachmentSignedUrl: vi.fn(),
  deleteSupplyQuoteAttachment: vi.fn(),
  listSupplyQuoteAttachments: vi.fn(),
  uploadSupplyQuoteAttachment: vi.fn(),
  validateQuoteAttachment: vi.fn(),
}));
vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  deleteSupplyQuote: vi.fn(),
  listSuppliers: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
  saveSupplyQuote: vi.fn(),
  setSupplyQuoteStatus: vi.fn(),
}));

const store: Store = {
  id: 'store-1',
  code: 'LOJ-001',
  name: 'Loja Um',
  city: 'Campinas',
  state: 'SP',
  address: null,
  responsibleUserId: null,
  responsibleName: null,
  status: 'planning',
  plannedOpeningDate: null,
  notes: null,
};
const item: SupplyItem = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cadeira',
  description: null,
  category: 'Mobiliario',
  subcategory: null,
  groupName: null,
  areaName: null,
  type: 'product',
  defaultUnit: 'un',
  defaultQuantity: null,
  brandReference: null,
  technicalSpecification: null,
  productLink: null,
  active: true,
  createdAt: '2026-08-17T00:00:00Z',
  updatedAt: '2026-08-17T00:00:00Z',
};
const need: SupplyNeed = {
  id: 'need-1',
  storeId: store.id,
  storeCode: store.code,
  storeName: store.name,
  storeCity: store.city,
  storeState: store.state,
  title: 'Cadeiras de atendimento',
  description: null,
  category: 'Mobiliario',
  quantity: 3,
  unit: 'un',
  priority: 'high',
  status: 'identified',
  notes: null,
  origin: 'manual',
  sourceImplementationItemId: null,
  supplyItemId: item.id,
  createdAt: '2026-08-17T00:00:00Z',
};
const supplier: Supplier = {
  id: 'supplier-1',
  code: 'FOR-0001',
  tradeName: 'Fornecedor Um',
  legalName: null,
  personType: 'legal',
  document: null,
  contactName: 'Ana',
  phone: null,
  email: null,
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
      label: null,
      city: 'Campinas',
      state: 'SP',
      servesNationally: false,
      active: true,
    },
  ],
};

const quoteItem: SupplyQuoteItem = {
  id: 'quote-item-1',
  quoteId: 'quote-draft',
  supplyItemId: item.id,
  itemCode: item.code,
  itemName: item.name,
  storeNeedId: need.id,
  needTitle: need.title,
  storeId: store.id,
  storeCode: store.code,
  storeName: store.name,
  quantity: '3',
  unit: 'un',
  unitPrice: '10.00',
  discountAmount: '0.00',
  shippingType: 'free',
  shippingAmount: '0.00',
  otherCosts: '0.00',
  deliveryDays: 5,
  minimumQuantity: null,
  offeredBrandModel: null,
  notes: null,
  productUrl: 'https://fornecedor.example/cadeira',
  capturedAt: null,
};

const draftQuote: SupplyQuote = {
  id: 'quote-draft',
  code: 'COT-00001',
  supplierId: supplier.id,
  supplierName: supplier.tradeName,
  supplierChannelId: supplier.channels[0].id,
  channel: 'local_city',
  originCity: 'Campinas',
  originState: 'SP',
  quoteDate: '2026-08-17',
  validUntil: '2099-12-31',
  contact: null,
  contextType: 'store',
  status: 'draft',
  notes: null,
  createdAt: '2026-08-17T00:00:00Z',
  stores: [store],
  items: [quoteItem],
};

const attachment: SupplyQuoteAttachment = {
  id: 'attachment-1',
  quoteId: draftQuote.id,
  originalName: 'proposta.pdf',
  storagePath: `cotacoes/${draftQuote.id}/attachment-1/proposta.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1000,
  description: null,
  createdAt: '2026-08-17T00:00:00Z',
};

function quoteWithStatus(status: SupplyQuoteStatus): SupplyQuote {
  return {
    ...draftQuote,
    id: `quote-${status}`,
    code: `COT-${status}`,
    status,
    items: [{ ...quoteItem, id: `item-${status}`, quoteId: `quote-${status}` }],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplyQuotesPage />
    </MemoryRouter>,
  );
}

describe('SupplyQuotesPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyQuotes).mockResolvedValue([]);
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([]);
    vi.mocked(listSupplyItems).mockResolvedValue([item]);
    vi.mocked(listSupplyNeeds).mockResolvedValue([need]);
    vi.mocked(listSuppliers).mockResolvedValue([supplier]);
    vi.mocked(listStores).mockResolvedValue([store]);
    vi.mocked(saveSupplyQuote).mockResolvedValue('quote-1');
    vi.mocked(deleteSupplyQuote).mockResolvedValue();
    vi.mocked(setSupplyQuoteStatus).mockResolvedValue();
  });

  it('cria cotacao com multiplos itens, frete e totais', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nova cotacao' }));
    await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
    await user.selectOptions(screen.getByLabelText('Loja da cotacao'), store.id);
    await user.selectOptions(screen.getByLabelText('Necessidade 1'), need.id);
    await user.clear(screen.getByLabelText('Preco unitario 1'));
    await user.type(screen.getByLabelText('Preco unitario 1'), '10');
    await user.selectOptions(screen.getByLabelText('Frete 1'), 'informed');
    await user.type(screen.getByLabelText('Valor do frete 1'), '5');

    await user.click(screen.getByRole('button', { name: 'Adicionar item' }));
    await user.selectOptions(screen.getByLabelText('Item do catalogo 2'), item.id);
    await user.clear(screen.getByLabelText('Preco unitario 2'));
    await user.type(screen.getByLabelText('Preco unitario 2'), '20');
    await user.selectOptions(screen.getByLabelText('Frete 2'), 'free');

    expect(screen.getByText('R$ 55,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar cotacao' }));
    expect(saveSupplyQuote).toHaveBeenCalledOnce();
    const payload = vi.mocked(saveSupplyQuote).mock.calls[0]?.[0];
    expect(payload).toMatchObject({ supplierId: supplier.id, storeIds: [store.id] });
    expect(payload?.items).toHaveLength(2);
    expect(payload?.items[0]).toMatchObject({
      storeNeedId: need.id,
      quantity: '3',
      unitPrice: '10',
      shippingAmount: '5',
    });
    expect(payload?.items[1]).toMatchObject({
      supplyItemId: item.id,
      unitPrice: '20',
      shippingType: 'free',
    });
  });

  it('exige valor quando o frete e informado', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nova cotacao' }));
    await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
    await user.selectOptions(screen.getByLabelText('Loja da cotacao'), store.id);
    await user.selectOptions(screen.getByLabelText('Item do catalogo 1'), item.id);
    await user.selectOptions(screen.getByLabelText('Frete 1'), 'informed');
    await user.click(screen.getByRole('button', { name: 'Salvar cotacao' }));
    expect(screen.getByLabelText('Valor do frete 1')).toBeInvalid();
    expect(saveSupplyQuote).not.toHaveBeenCalled();
  });

  it('esconde a criacao para Consulta', async () => {
    vi.mocked(useSession).mockReturnValue({
      can: (capability: string) => capability === 'quotes.view',
    } as never);
    renderPage();
    expect(await screen.findByText('Nenhuma cotacao encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova cotacao' })).not.toBeInTheDocument();
  });

  it('altera status sem reenviar o conteudo da cotacao', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuotes).mockResolvedValue([draftQuote]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Alterar status COT-00001' }));
    await user.click(screen.getByRole('button', { name: 'Marcar como recebida' }));

    expect(setSupplyQuoteStatus).toHaveBeenCalledWith(draftQuote.id, 'received');
    expect(saveSupplyQuote).not.toHaveBeenCalled();
  });

  it('exclui somente cotacao em Rascunho apos confirmacao', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuotes).mockResolvedValue([draftQuote, quoteWithStatus('received')]);
    renderPage();

    expect(
      await screen.findByRole('button', { name: `Excluir ${draftQuote.code}` }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir COT-received' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Excluir ${draftQuote.code}` }));
    await user.click(screen.getByRole('button', { name: 'Excluir rascunho' }));

    expect(deleteSupplyQuote).toHaveBeenCalledWith(draftQuote.id);
  });

  it.each<SupplyQuoteStatus>(['draft', 'received', 'expired', 'cancelled'])(
    'edita o conteudo em status %s sem alterar o status',
    async (status) => {
      const user = userEvent.setup();
      const quote = quoteWithStatus(status);
      vi.mocked(listSupplyQuotes).mockResolvedValue([quote]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: `Editar ${quote.code}` }));
      expect(screen.getByLabelText('Status')).toHaveValue(
        { draft: 'Rascunho', received: 'Recebida', expired: 'Expirada', cancelled: 'Cancelada' }[
          status
        ],
      );
      await user.clear(screen.getByLabelText('Observacoes gerais'));
      await user.type(screen.getByLabelText('Observacoes gerais'), `Edicao ${status}`);
      await user.click(screen.getByRole('button', { name: 'Salvar cotacao' }));

      expect(saveSupplyQuote).toHaveBeenCalledWith(
        expect.objectContaining({ id: quote.id, status, notes: `Edicao ${status}` }),
      );
      expect(setSupplyQuoteStatus).not.toHaveBeenCalled();
    },
  );

  it('exibe produto somente para URL web segura e expande todos os detalhes', async () => {
    const user = userEvent.setup();
    const unsafeItem = {
      ...quoteItem,
      id: 'quote-item-unsafe',
      itemName: 'Item sem URL segura',
      productUrl: 'javascript:alert(1)',
    };
    vi.mocked(listSupplyQuotes).mockResolvedValue([
      { ...draftQuote, items: [quoteItem, unsafeItem] },
    ]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ver todos os detalhes' }));
    const productLinks = screen.getAllByRole('link', { name: 'Ver produto' });
    expect(productLinks).toHaveLength(1);
    expect(productLinks[0]).toHaveAttribute('href', quoteItem.productUrl);
    expect(productLinks[0]).toHaveAttribute('target', '_blank');
    expect(productLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Item sem URL segura/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recolher todos os detalhes' })).toBeInTheDocument();
  });

  it('mostra contagem de anexos e resume apenas as cotacoes filtradas', async () => {
    const user = userEvent.setup();
    const receivedQuote = {
      ...quoteWithStatus('received'),
      supplierName: 'Outro fornecedor',
    };
    vi.mocked(listSupplyQuotes).mockResolvedValue([draftQuote, receivedQuote]);
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([attachment]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Anexos COT-00001 (1)' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar cotacoes'), 'Fornecedor Um');
    await user.selectOptions(screen.getByLabelText('Filtrar status'), 'draft');
    await user.selectOptions(screen.getByLabelText('Filtrar loja'), store.id);
    await user.click(screen.getByRole('button', { name: 'Ver resumo' }));

    const dialog = screen.getByRole('dialog', { name: 'Resumo das cotacoes' });
    expect(
      within(dialog).getByText('Fornecedor Um · Rascunho · LOJ-001 - Loja Um'),
    ).toBeInTheDocument();
    const totalQuotes = within(dialog).getByText('Total de cotacoes').closest('article');
    expect(totalQuotes).not.toBeNull();
    expect(within(totalQuotes as HTMLElement).getByText('1')).toBeInTheDocument();
  });
});
