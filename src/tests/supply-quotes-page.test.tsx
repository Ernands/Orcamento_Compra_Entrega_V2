import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import { listSupplyQuoteAttachments } from '../data/attachments/quote-attachments-repository';
import { approveSupplyQuoteForPurchase } from '../data/purchases/purchases-repository';
import {
  EMPTY_QUOTE_PAYMENT_TERMS,
  getQuotePaymentTerms,
  saveSupplyQuoteWithPaymentTerms,
} from '../data/purchases/quote-payment-terms-repository';
import { listStores } from '../data/stores/stores-repository';
import {
  deleteSupplyQuote,
  listSupplyFreightProfiles,
  listSuppliers,
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
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
vi.mock('../data/attachments/quote-attachments-repository', async () => {
  const actual = await vi.importActual('../data/attachments/quote-attachments-repository');
  return {
    ...actual,
    createSupplyQuoteAttachmentSignedUrl: vi.fn(),
    deleteSupplyQuoteAttachment: vi.fn(),
    listSupplyQuoteAttachments: vi.fn(),
    uploadSupplyQuoteAttachment: vi.fn(),
    validateQuoteAttachment: vi.fn(),
  };
});
vi.mock('../data/purchases/purchases-repository', () => ({
  approveSupplyQuoteForPurchase: vi.fn(),
}));
vi.mock('../data/purchases/quote-payment-terms-repository', async () => {
  const actual = await vi.importActual('../data/purchases/quote-payment-terms-repository');
  return {
    ...actual,
    getQuotePaymentTerms: vi.fn(),
    saveSupplyQuoteWithPaymentTerms: vi.fn(),
  };
});
vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));
vi.mock('../data/supplies/supplies-repository', () => ({
  deleteSupplyQuote: vi.fn(),
  listSupplyFreightProfiles: vi.fn(),
  listSuppliers: vi.fn(),
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
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
    vi.mocked(listSupplyFreightProfiles).mockResolvedValue([]);
    vi.mocked(getQuotePaymentTerms).mockResolvedValue(EMPTY_QUOTE_PAYMENT_TERMS);
    vi.mocked(saveSupplyQuoteWithPaymentTerms).mockResolvedValue('quote-1');
    vi.mocked(approveSupplyQuoteForPurchase).mockResolvedValue('purchase-1');
    vi.mocked(deleteSupplyQuote).mockResolvedValue();
    vi.mocked(setSupplyQuoteStatus).mockResolvedValue();
  });

  it('cria cotacao com varios itens, frete e condicoes de pagamento', async () => {
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
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'credit_card');
    await user.type(screen.getByLabelText('Valor de entrada'), '49,80');
    await user.type(screen.getByLabelText('Quantidade de parcelas'), '3');

    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar cotacao' }));

    expect(saveSupplyQuoteWithPaymentTerms).toHaveBeenCalledOnce();
    const [payload, payment] = vi.mocked(saveSupplyQuoteWithPaymentTerms).mock.calls[0];
    expect(payload).toMatchObject({ supplierId: supplier.id, storeIds: [store.id] });
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({
      storeNeedId: need.id,
      quantity: '3',
      unitPrice: '10',
      shippingAmount: '5',
    });
    expect(payload.items[1]).toMatchObject({
      supplyItemId: item.id,
      unitPrice: '20',
      shippingType: 'free',
    });
    expect(payment).toMatchObject({
      paymentMethod: 'credit_card',
      entryAmount: '49,80',
      installmentCount: '3',
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
    expect(saveSupplyQuoteWithPaymentTerms).not.toHaveBeenCalled();
  });

  it('mantem o modal aberto ao aplicar prospectores sem perfil de frete', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nova cotacao' }));
    await user.click(screen.getByRole('button', { name: 'Consolidada' }));
    await user.click(screen.getByRole('checkbox', { name: /Selecionar todas as lojas/ }));
    await user.click(screen.getByRole('button', { name: 'Prospectores / UF em todos' }));

    expect(screen.getByRole('dialog', { name: 'Nova cotacao' })).toBeInTheDocument();
    expect(
      screen.getByText('Lojas sem perfil de frete: LOJ-001. Use "Lojas da cotacao" para este item.'),
    ).toBeInTheDocument();
  });

  it('esconde criacao sem permissao de criar cotacoes', async () => {
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
    expect(saveSupplyQuoteWithPaymentTerms).not.toHaveBeenCalled();
  });

  it('permite voltar cotacao recebida para rascunho', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: `Alterar status ${received.code}` }));
    await user.click(screen.getByRole('button', { name: 'Voltar para rascunho' }));

    expect(setSupplyQuoteStatus).toHaveBeenCalledWith(received.id, 'draft');
    expect(saveSupplyQuoteWithPaymentTerms).not.toHaveBeenCalled();
  });

  it('orienta devolver a compra quando houver CMP ativa ao voltar para rascunho', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received]);
    vi.mocked(setSupplyQuoteStatus).mockRejectedValue(new Error('quote has active purchase'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: `Alterar status ${received.code}` }));
    await user.click(screen.getByRole('button', { name: 'Voltar para rascunho' }));

    expect(
      await screen.findByText(
        'Esta cotacao possui uma compra ativa. Devolva a compra para cotacao antes de voltar ao rascunho.',
      ),
    ).toBeInTheDocument();
  });

  it('aprova cotacao recebida e cria compra pelo modal de status', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: `Alterar status ${received.code}` }));
    await user.click(screen.getByRole('button', { name: 'Aprovar compra' }));

    expect(approveSupplyQuoteForPurchase).toHaveBeenCalledWith(received.id);
    expect(saveSupplyQuoteWithPaymentTerms).not.toHaveBeenCalled();
  });

  it('informa quando o backend negar permissao para aprovar compra', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received]);
    vi.mocked(approveSupplyQuoteForPurchase).mockRejectedValue(new Error('permission denied'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: `Alterar status ${received.code}` }));
    await user.click(screen.getByRole('button', { name: 'Aprovar compra' }));

    expect(
      await screen.findByText('Seu usuario nao possui permissao para aprovar esta cotacao para compra.'),
    ).toBeInTheDocument();
  });

  it('exclui somente cotacao em rascunho apos confirmacao', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuotes).mockResolvedValue([draftQuote, quoteWithStatus('received')]);
    renderPage();

    expect(await screen.findByRole('button', { name: `Excluir ${draftQuote.code}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir COT-received' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Excluir ${draftQuote.code}` }));
    await user.click(screen.getByRole('button', { name: 'Excluir rascunho' }));

    expect(deleteSupplyQuote).toHaveBeenCalledWith(draftQuote.id);
  });

  it.each<SupplyQuoteStatus>(['draft', 'received', 'expired', 'cancelled'])(
    'edita conteudo em status %s sem alterar o status',
    async (status) => {
      const user = userEvent.setup();
      const quote = quoteWithStatus(status);
      vi.mocked(listSupplyQuotes).mockResolvedValue([quote]);
      vi.mocked(getQuotePaymentTerms).mockResolvedValue({
        paymentMethod: 'pix',
        entryAmount: '10.00',
        installmentCount: '1',
        paymentNotes: 'Pagamento original',
      });
      renderPage();

      await user.click(await screen.findByRole('button', { name: `Editar ${quote.code}` }));
      expect(screen.getByLabelText('Status')).toHaveValue(
        { draft: 'Rascunho', received: 'Recebida', expired: 'Expirada', cancelled: 'Cancelada' }[
          status
        ],
      );
      expect(await screen.findByLabelText('Forma de pagamento')).toHaveValue('pix');
      await user.clear(screen.getByLabelText('Observacoes gerais'));
      await user.type(screen.getByLabelText('Observacoes gerais'), `Edicao ${status}`);
      await user.click(screen.getByRole('button', { name: 'Salvar cotacao' }));

      expect(saveSupplyQuoteWithPaymentTerms).toHaveBeenCalledWith(
        expect.objectContaining({ id: quote.id, status, notes: `Edicao ${status}` }),
        expect.objectContaining({ paymentMethod: 'pix' }),
      );
      expect(setSupplyQuoteStatus).not.toHaveBeenCalled();
    },
  );

  it('exibe link apenas para URL web segura e expande todos os detalhes', async () => {
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
  });

  it('mostra no detalhe expandido os destaques da comparacao entre cotacoes recebidas', async () => {
    const user = userEvent.setup();
    const quoteA: SupplyQuote = {
      ...quoteWithStatus('received'),
      id: 'quote-comparison-a',
      code: 'COT-COMP-A',
      supplierName: 'Fornecedor A',
      items: [
        {
          ...quoteItem,
          id: 'quote-item-comparison-a',
          quoteId: 'quote-comparison-a',
          unitPrice: '10.00',
          shippingType: 'informed',
          shippingAmount: '100.00',
          deliveryDays: 8,
        },
      ],
    };
    const quoteB: SupplyQuote = {
      ...quoteWithStatus('received'),
      id: 'quote-comparison-b',
      code: 'COT-COMP-B',
      supplierName: 'Fornecedor B',
      items: [
        {
          ...quoteItem,
          id: 'quote-item-comparison-b',
          quoteId: 'quote-comparison-b',
          unitPrice: '11.00',
          shippingType: 'free',
          shippingAmount: '0.00',
          deliveryDays: 3,
        },
      ],
    };
    vi.mocked(listSupplyQuotes).mockResolvedValue([quoteA, quoteB]);
    renderPage();

    const quoteACode = await screen.findByText('COT-COMP-A');
    const quoteAGroup = quoteACode.closest('.quote-list__group');
    expect(quoteAGroup).not.toBeNull();
    await user.click(within(quoteAGroup as HTMLElement).getByRole('button', { name: 'Detalhar COT-COMP-A' }));

    expect(within(quoteAGroup as HTMLElement).getByText('Menor preco')).toBeInTheDocument();
    expect(within(quoteAGroup as HTMLElement).queryByText('Menor custo')).not.toBeInTheDocument();
    expect(within(quoteAGroup as HTMLElement).queryByText('Menor prazo')).not.toBeInTheDocument();

    const quoteBCode = screen.getByText('COT-COMP-B');
    const quoteBGroup = quoteBCode.closest('.quote-list__group');
    expect(quoteBGroup).not.toBeNull();
    await user.click(within(quoteBGroup as HTMLElement).getByRole('button', { name: 'Detalhar COT-COMP-B' }));

    expect(within(quoteBGroup as HTMLElement).queryByText('Menor preco')).not.toBeInTheDocument();
    expect(within(quoteBGroup as HTMLElement).getByText('Menor custo')).toBeInTheDocument();
    expect(within(quoteBGroup as HTMLElement).getByText('Menor prazo')).toBeInTheDocument();
  });

  it('mostra contagem de anexos e resume apenas as cotacoes filtradas', async () => {
    const user = userEvent.setup();
    const receivedQuote = {
      ...quoteWithStatus('received'),
      supplierName: 'Outro fornecedor',
    };
    vi.mocked(listSupplyQuotes).mockResolvedValue([draftQuote, receivedQuote]);
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([
      { ...attachment, documentType: 'quote' } as never,
    ]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Anexos COT-00001 (1)' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar cotacoes'), 'Fornecedor Um');
    await user.selectOptions(screen.getByLabelText('Filtrar status'), 'draft');
    await user.selectOptions(screen.getByLabelText('Filtrar loja'), store.id);
    await user.click(screen.getByRole('button', { name: 'Ver resumo' }));

    const dialog = screen.getByRole('dialog', { name: 'Resumo das cotacoes' });
    expect(within(dialog).getByText('Fornecedor Um · Rascunho · LOJ-001 - Loja Um')).toBeInTheDocument();
    const totalQuotes = within(dialog).getByText('Total de cotacoes').closest('article');
    expect(totalQuotes).not.toBeNull();
    expect(within(totalQuotes as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('filtra cotacoes pela categoria e area do mesmo item', async () => {
    const user = userEvent.setup();
    const climateItem: SupplyItem = {
      ...item,
      id: 'item-clima',
      code: 'ITM-0087',
      name: 'Ar-condicionado split inverter',
      category: 'Climatizacao',
      areaName: 'Atendimento',
    };
    const officeItem: SupplyItem = {
      ...item,
      id: 'item-office',
      code: 'ITM-0090',
      name: 'Cadeira administrativa',
      category: 'Mobiliario',
      areaName: 'Itens Gerais',
    };
    const climateQuote = {
      ...quoteWithStatus('received'),
      id: 'quote-clima',
      code: 'COT-CLIMA',
      items: [{
        ...quoteItem,
        id: 'quote-item-clima',
        quoteId: 'quote-clima',
        supplyItemId: climateItem.id,
        itemCode: climateItem.code,
        itemName: climateItem.name,
      }],
    };
    const officeQuote = {
      ...quoteWithStatus('received'),
      id: 'quote-office',
      code: 'COT-OFFICE',
      items: [{
        ...quoteItem,
        id: 'quote-item-office',
        quoteId: 'quote-office',
        supplyItemId: officeItem.id,
        itemCode: officeItem.code,
        itemName: officeItem.name,
      }],
    };
    vi.mocked(listSupplyItems).mockResolvedValue([climateItem, officeItem]);
    vi.mocked(listSupplyQuotes).mockResolvedValue([climateQuote, officeQuote]);
    renderPage();

    await screen.findByText('COT-CLIMA');
    await user.selectOptions(screen.getByLabelText('Filtrar categoria do item'), 'Climatizacao');
    await user.selectOptions(screen.getByLabelText('Filtrar area do item'), 'Atendimento');

    expect(screen.getByText('COT-CLIMA')).toBeInTheDocument();
    expect(screen.queryByText('COT-OFFICE')).not.toBeInTheDocument();
  });

  it('ignora cotacoes canceladas no resumo quando o status cancelada nao foi solicitado', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    const cancelled = quoteWithStatus('cancelled');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received, cancelled]);
    renderPage();

    await screen.findByText(received.code);
    await user.click(screen.getByRole('button', { name: 'Ver resumo' }));

    const dialog = screen.getByRole('dialog', { name: 'Resumo das cotacoes' });
    const totalQuotes = within(dialog).getByText('Total de cotacoes').closest('article');
    expect(totalQuotes).not.toBeNull();
    expect(within(totalQuotes as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('inclui canceladas no resumo quando o filtro de status estiver em cancelada', async () => {
    const user = userEvent.setup();
    const received = quoteWithStatus('received');
    const cancelled = quoteWithStatus('cancelled');
    vi.mocked(listSupplyQuotes).mockResolvedValue([received, cancelled]);
    renderPage();

    await screen.findByText(received.code);
    await user.selectOptions(screen.getByLabelText('Filtrar status'), 'cancelled');
    await user.click(screen.getByRole('button', { name: 'Ver resumo' }));

    const dialog = screen.getByRole('dialog', { name: 'Resumo das cotacoes' });
    expect(within(dialog).getByText('Sem pesquisa · Cancelada · Todas as lojas')).toBeInTheDocument();
    const totalQuotes = within(dialog).getByText('Total de cotacoes').closest('article');
    expect(totalQuotes).not.toBeNull();
    expect(within(totalQuotes as HTMLElement).getByText('1')).toBeInTheDocument();
  });
});
