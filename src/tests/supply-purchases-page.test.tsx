import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  cancelSupplyPurchaseOrderV2,
  createSupplyPurchaseOrderV2,
  listSupplyPurchasesV2,
  savePurchaseDestinationDistributionV2,
  savePurchaseOrderLineDistributionV2,
  savePurchasePaymentV2,
} from '../data/purchases/purchases-v2-repository';
import type { PurchaseItemV2, PurchaseOrderLineV2, PurchaseV2 } from '../domain/purchase-v2-types';
import { SupplyPurchasesPage } from '../pages/supply-purchases-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/purchases/purchases-v2-repository', async () => {
  const actual = await vi.importActual('../data/purchases/purchases-v2-repository');
  return {
    ...actual,
    listSupplyPurchasesV2: vi.fn(),
    createSupplyPurchaseOrderV2: vi.fn(),
    cancelSupplyPurchaseOrderV2: vi.fn(),
    savePurchaseDestinationDistributionV2: vi.fn(),
    savePurchaseOrderLineDistributionV2: vi.fn(),
    savePurchasePaymentV2: vi.fn(),
    uploadPurchaseAttachmentV3: vi.fn(),
    createPurchaseAttachmentSignedUrlV2: vi.fn(),
    createQuoteAttachmentSignedUrlReadOnlyV2: vi.fn(),
    deletePurchaseAttachmentV2: vi.fn(),
    returnPurchaseToQuoteV2: vi.fn(),
    validatePurchaseAttachmentV2: vi.fn(),
  };
});

const baseItem: PurchaseItemV2 = {
  id: 'item-1', purchaseId: 'purchase-1', sourceQuoteItemId: 'quote-item-1', supplyItemId: 'supply-item-1',
  itemCode: 'ITM-0001', itemName: 'Cadeira operacional', itemDescription: null, itemCategory: 'Mobiliario', itemArea: 'Transacional',
  brandReference: null, technicalSpecification: null, offeredBrandModel: 'Modelo A', productUrl: null,
  storeId: null, storeCode: null, quantityApproved: '10', purchasedQuantity: '4', unit: 'un', quotedUnitPrice: '100',
  quotedDiscountAmount: '0', quotedShippingType: 'free', quotedShippingAmount: '0', quotedOtherCosts: '0', quotedDeliveryDays: 5,
  approvedLineTotal: '1000', actualTotal: '400', itemContextSnapshotSource: 'approval', quoteItemNotes: 'Conferir cor', destinations: [],
};

const partialLine: PurchaseOrderLineV2 = {
  id: 'line-1', orderId: 'order-1', purchaseItemId: 'item-1', purchaseDestinationId: null,
  itemCode: 'ITM-0001', itemName: 'Cadeira operacional', destinationLabel: null, destinationState: null,
  quantity: '4', unit: 'un', unitPrice: '100', discountAmount: '0', shippingType: 'free', actualShippingType: 'free',
  shippingAmount: '0', otherCosts: '0', lineTotal: '400', expectedDeliveryDate: '2026-09-06', notes: null,
  storeDistributionStatus: 'pending', stores: [],
};

const purchase: PurchaseV2 = {
  id: 'purchase-1', code: 'CMP-00001', quoteId: 'quote-1', quoteCode: 'COT-00170', supplierId: 'supplier-1', supplierName: 'Fornecedor Teste',
  quoteDate: '2026-08-31', approvedTotal: '1000', hasPendingShipping: false, status: 'partially_purchased', notes: null,
  paymentMethodSnapshot: 'pix', entryAmountSnapshot: null, installmentCountSnapshot: null, paymentNotesSnapshot: null,
  approvedAt: '2026-09-01T10:00:00Z', returnedAt: null, supplierChannelId: 'channel-1', channelType: 'ecommerce',
  originCity: 'Fortaleza', originState: 'CE', contact: 'Compras', quoteContextSnapshotSource: 'approval',
  stores: [
    { id: 'ps-1', storeId: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Fortaleza', state: 'CE', address: 'Rua A', addressSnapshotSource: 'approval' },
    { id: 'ps-2', storeId: 'store-2', code: 'LOJ-002', name: 'Loja Dois', city: 'Sobral', state: 'CE', address: 'Rua B', addressSnapshotSource: 'approval' },
  ],
  items: [baseItem],
  orders: [{
    id: 'order-1', purchaseId: 'purchase-1', purchasedOn: '2026-09-01', supplierOrderRef: 'PED-1', expectedDeliveryDate: '2026-09-06',
    status: 'active', source: 'manual', notes: null, createdBy: 'user-1', createdByName: 'Comprador', createdAt: '2026-09-01T11:00:00Z',
    cancelledBy: null, cancelledByName: null, cancelledAt: null, cancellationReason: null, lines: [partialLine],
  }],
  payments: [{
    id: 'payment-1', purchaseId: 'purchase-1', purchaseOrderId: 'order-1', paymentMethod: 'pix', sourceLabel: 'Conta operacional', amount: '400',
    entryAmount: null, installmentCount: null, firstDueDate: '2026-09-01', status: 'paid', paidAt: '2026-09-01T12:00:00Z',
    notes: null, createdAt: '2026-09-01T12:00:00Z',
  }],
  attachments: [],
  quoteAttachments: [{ id: 'qa-1', quoteId: 'quote-1', originalName: 'proposta.pdf', storagePath: 'cotacoes/quote-1/proposta.pdf', mimeType: 'application/pdf', sizeBytes: 1000, description: null, documentType: 'quote', createdAt: '2026-08-31T12:00:00Z' }],
};

function renderPage(current: PurchaseV2 = purchase) {
  vi.mocked(listSupplyPurchasesV2).mockResolvedValue([current]);
  return render(<MemoryRouter><SupplyPurchasesPage /></MemoryRouter>);
}

describe('SupplyPurchasesPage V2', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(createSupplyPurchaseOrderV2).mockResolvedValue('order-new');
    vi.mocked(cancelSupplyPurchaseOrderV2).mockResolvedValue();
    vi.mocked(savePurchaseDestinationDistributionV2).mockResolvedValue('confirmed');
    vi.mocked(savePurchaseOrderLineDistributionV2).mockResolvedValue('confirmed');
    vi.mocked(savePurchasePaymentV2).mockResolvedValue('payment-new');
  });

  it('mantem o reembolso fora da operacao e exibe os pagamentos', async () => {
    const user = userEvent.setup();
    renderPage();
    const purchaseCode = await screen.findByText('CMP-00001');
    expect(screen.getByText(/Execucao do aprovado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    expect(screen.getByText('1 pagamentos ativos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerenciar compra CMP-00001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar lojas CMP-00001 (1)' })).toBeInTheDocument();
    expect(purchaseCode.closest('article')).toHaveClass('purchase-v2-card--partially_purchased');
    expect(screen.queryByText(/Reembolso solicitado/)).not.toBeInTheDocument();
  });

  it('lista pagamento existente e permite registrar um novo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Gerenciar compra CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    expect(within(dialog).getByRole('tab', { name: 'Compra' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('tab', { name: /Pagamentos/ }));
    expect(within(dialog).getByText('Conta operacional')).toBeInTheDocument();
    expect(within(dialog).getByText('R$ 400,00')).toBeInTheDocument();
    expect(within(dialog).getAllByText('01/09/2026 · PED-1 · ativo')).toHaveLength(2);
    await user.selectOptions(within(dialog).getByLabelText('Registro/pedido relacionado'), 'order-1');
    await user.clear(within(dialog).getByLabelText('Valor'));
    await user.type(within(dialog).getByLabelText('Valor'), '250');
    await user.selectOptions(within(dialog).getByLabelText('Situacao'), 'paid');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pagamento' }));
    expect(savePurchasePaymentV2).toHaveBeenCalledWith(expect.objectContaining({
      purchaseId: 'purchase-1', purchaseOrderId: 'order-1', paymentMethod: 'pix', amount: '250', status: 'paid',
    }));
  });

  it('registra item sem destino sem inventar purchase_destination_id', async () => {
    const user = userEvent.setup();
    renderPage({ ...purchase, orders: [], status: 'approved' });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    expect(within(dialog).queryByLabelText('Destino')).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Frete realizado'));
    await user.type(within(dialog).getByLabelText('Frete realizado'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));
    expect(createSupplyPurchaseOrderV2).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ purchaseDestinationId: null, shippingAmount: '0' })] }));
    expect(within(dialog).getByText('Compra registrada.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Pagamento e arquivo sao opcionais/)).toBeInTheDocument();
  });

  it('permite frete vazio como nao informado e envia o valor vazio ao RPC', async () => {
    const user = userEvent.setup();
    renderPage({ ...purchase, orders: [], status: 'approved' });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    await user.clear(within(dialog).getByLabelText('Frete realizado'));
    expect(within(dialog).getByText(/Pendente · frete nao informado/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));
    expect(createSupplyPurchaseOrderV2).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({ shippingAmount: '' })],
    }));
  });

  it('preserva a previsao de entrega alterada manualmente', async () => {
    const user = userEvent.setup();
    renderPage({ ...purchase, orders: [], status: 'approved' });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    fireEvent.input(within(dialog).getByLabelText('Previsao de entrega'), { target: { value: '2099-10-10' } });
    await user.clear(within(dialog).getByLabelText('Frete realizado'));
    await user.type(within(dialog).getByLabelText('Frete realizado'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));
    expect(createSupplyPurchaseOrderV2).toHaveBeenCalledWith(expect.objectContaining({
      expectedDeliveryDate: '2099-10-10',
      lines: [expect.objectContaining({ expectedDeliveryDate: '2099-10-10' })],
    }));
  });

  it('seleciona automaticamente destino direto unico e envia o id correto', async () => {
    const user = userEvent.setup();
    const directItem: PurchaseItemV2 = { ...baseItem, destinations: [{
      id: 'destination-1', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd-1', destinationType: 'store', profileId: null, storeId: 'store-1', label: 'LOJ-001', state: 'CE', destinationCount: 1,
      quantity: '10', unit: 'un', quotedShippingType: 'free', quotedShippingAmount: '0', quotedDeliveryDays: 5, notes: null, position: 0, distributionStatus: 'confirmed', snapshotSource: 'approval',
      stores: [{ id: 'ds-1', purchaseDestinationId: 'destination-1', storeId: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Fortaleza', state: 'CE', allocatedQuantity: '10', allocationSource: 'direct' }],
    }] };
    renderPage({ ...purchase, items: [directItem], orders: [], status: 'approved' });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    expect(within(dialog).getByLabelText('Destino')).toHaveValue('destination-1');
    await user.type(within(dialog).getByLabelText('Frete realizado'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));
    expect(createSupplyPurchaseOrderV2).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ purchaseDestinationId: 'destination-1' })] }));
  });

  it('expande e recolhe uma compra e oferece controle para todas', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('CMP-00001');
    expect(screen.queryByText('Registros realizados')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir todas as compras' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detalhar CMP-00001' }));
    expect(screen.getByText('Registros realizados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recolher CMP-00001' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recolher todas as compras' }));
    expect(screen.queryByText('Registros realizados')).not.toBeInTheDocument();
  });

  it('marca compra em andamento em azul e compra concluida em verde', async () => {
    const first = renderPage();
    await screen.findByText('CMP-00001');
    expect(first.container.querySelector('.purchase-v2-card.is-pending')).not.toBeNull();
    first.unmount();

    const completedItem: PurchaseItemV2 = { ...baseItem, quantityApproved: '4' };
    const completedPurchase: PurchaseV2 = {
      ...purchase,
      status: 'purchased',
      items: [completedItem],
      orders: [{ ...purchase.orders[0], lines: [{ ...partialLine, quantity: '4' }] }],
    };
    const second = renderPage(completedPurchase);
    await screen.findByText('CMP-00001');
    expect(second.container.querySelector('.purchase-v2-card.is-realized')).not.toBeNull();
  });

  it('usa confirmar loja quando o destino possui somente uma loja', async () => {
    const user = userEvent.setup();
    const singleStoreItem: PurchaseItemV2 = { ...baseItem, destinations: [{
      id: 'single-profile', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd-single', destinationType: 'profile', profileId: 'fp-single', storeId: null, label: 'Charles Pitter', state: 'MG', destinationCount: 1,
      quantity: '10', unit: 'un', quotedShippingType: 'informed', quotedShippingAmount: '5', quotedDeliveryDays: 1, notes: null, position: 0, distributionStatus: 'pending', snapshotSource: 'approval',
      stores: [
        { id: 'ds-single', purchaseDestinationId: 'single-profile', storeId: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Fortaleza', state: 'CE', allocatedQuantity: null, allocationSource: 'snapshot' },
      ],
    }] };
    renderPage({ ...purchase, items: [singleStoreItem], orders: [], status: 'approved' });

    await user.click(await screen.findByRole('button', { name: 'Detalhar CMP-00001' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar loja' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar loja · Charles Pitter' });
    expect(within(dialog).getByDisplayValue('10')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar loja' }));
    expect(savePurchaseDestinationDistributionV2).toHaveBeenCalledWith('single-profile', [
      { storeId: 'store-1', quantity: '10' },
    ]);
  });

  it('mantem variacao como Em andamento na compra parcial', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Resumo CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Resumo · CMP-00001' });
    expect(within(dialog).getByText('Em andamento')).toBeInTheDocument();
  });

  it('deixa fallback legado explicito no resumo e rateia o aprovado por loja', async () => {
    const user = userEvent.setup();
    const legacyItem: PurchaseItemV2 = { ...baseItem, sourceQuoteItemId: null, destinations: [] };
    renderPage({ ...purchase, items: [legacyItem] });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Resumo CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Resumo · CMP-00001' });

    await user.click(within(dialog).getByRole('button', { name: 'Prospector/UF' }));
    expect(within(dialog).getByText('Fallback legado')).toBeInTheDocument();
    expect(within(dialog).getByText('Rateio igualitario legado')).toBeInTheDocument();
    expect(within(dialog).getByText('Rateio igual no aprovado')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Loja' }));
    expect(within(dialog).getAllByText('R$ 500,00')).toHaveLength(2);
    const approvedUnallocated = within(dialog).getByText('Aprovado nao alocado').parentElement;
    expect(approvedUnallocated).not.toBeNull();
    expect(within(approvedUnallocated as HTMLElement).getByText('R$ 0,00')).toBeInTheDocument();
  });

  it('nao chama frete legado incerto de gratis no historico', async () => {
    const user = userEvent.setup();
    const legacyLine = { ...partialLine, shippingType: 'free' as const, actualShippingType: 'pending' as const, shippingAmount: '0' };
    const legacyOrder = { ...purchase.orders[0], source: 'legacy_backfill' as const, lines: [legacyLine] };
    renderPage({ ...purchase, orders: [legacyOrder] });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Historico CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Historico · CMP-00001' });
    expect(within(dialog).getByText('Nao informado')).toBeInTheDocument();
    expect(within(dialog).queryByText('Gratis')).not.toBeInTheDocument();
  });

  it('exibe historico cancelado sem apagar o registro', async () => {
    const user = userEvent.setup();
    const cancelled = { ...purchase.orders[0], id: 'order-cancelled', status: 'cancelled' as const, cancelledByName: 'Comprador', cancelledAt: '2026-09-01T13:00:00Z', cancellationReason: 'Pedido duplicado' };
    renderPage({ ...purchase, orders: [cancelled] });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Historico CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Historico · CMP-00001' });
    expect(within(dialog).getByText('Pedido duplicado')).toBeInTheDocument();
    expect(within(dialog).getByText(/Cancelado por Comprador/)).toBeInTheDocument();
  });

  it('distribui destino Prospector/UF pelas lojas elegiveis', async () => {
    const user = userEvent.setup();
    const profileItem: PurchaseItemV2 = { ...baseItem, destinations: [{
      id: 'profile-1', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd-1', destinationType: 'profile', profileId: 'fp-1', storeId: null, label: 'Valter Leandro', state: 'CE', destinationCount: 2,
      quantity: '10', unit: 'un', quotedShippingType: 'informed', quotedShippingAmount: '50', quotedDeliveryDays: 5, notes: null, position: 0, distributionStatus: 'pending', snapshotSource: 'approval',
      stores: [
        { id: 'ds-1', purchaseDestinationId: 'profile-1', storeId: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Fortaleza', state: 'CE', allocatedQuantity: null, allocationSource: 'snapshot' },
        { id: 'ds-2', purchaseDestinationId: 'profile-1', storeId: 'store-2', code: 'LOJ-002', name: 'Loja Dois', city: 'Sobral', state: 'CE', allocatedQuantity: null, allocationSource: 'snapshot' },
      ],
    }] };
    renderPage({ ...purchase, items: [profileItem], orders: [], status: 'approved' });
    await user.click(await screen.findByRole('button', { name: 'Detalhar CMP-00001' }));
    const distributeButton = screen.getByRole('button', { name: 'Distribuir entre lojas' });
    await user.click(distributeButton);
    const dialog = screen.getByRole('dialog', { name: 'Distribuir destino · Valter Leandro' });
    const inputs = within(dialog).getAllByPlaceholderText('Quantidade');
    await user.type(inputs[0], '4');
    await user.type(inputs[1], '6');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar distribuicao' }));
    expect(savePurchaseDestinationDistributionV2).toHaveBeenCalledWith('profile-1', [
      { storeId: 'store-1', quantity: '4' }, { storeId: 'store-2', quantity: '6' },
    ]);
  });

  it('permite distribuir fisicamente um registro sem destino', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Detalhar CMP-00001' }));
    await screen.findByText('Lojas pendentes');
    await user.click(screen.getByRole('button', { name: 'Distribuir registro' }));
    const dialog = screen.getByRole('dialog', { name: /Distribuir registro · Cadeira operacional/ });
    const inputs = within(dialog).getAllByRole('textbox');
    await user.type(inputs[0], '2');
    await user.type(inputs[1], '2');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar distribuicao' }));
    expect(savePurchaseOrderLineDistributionV2).toHaveBeenCalledWith('line-1', [
      { storeId: 'store-1', quantity: '2' }, { storeId: 'store-2', quantity: '2' },
    ]);
  });

  it('exibe documentos da cotacao em modo somente leitura', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Gerenciar compra CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    await user.click(within(dialog).getByRole('tab', { name: /Arquivos/ }));
    expect(within(dialog).getByText('Documentos da Cotacao · somente leitura')).toBeInTheDocument();
    expect(within(dialog).getByText('proposta.pdf')).toBeInTheDocument();
  });

  it('mostra a compra ou pedido relacionado em cada arquivo', async () => {
    const user = userEvent.setup();
    renderPage({
      ...purchase,
      attachments: [{
        id: 'attachment-1', purchaseId: 'purchase-1', purchaseOrderId: 'order-1', originalName: 'nota-fiscal.pdf',
        storagePath: 'compras/purchase-1/attachment-1/nota-fiscal.pdf', mimeType: 'application/pdf', sizeBytes: 1000,
        description: null, documentType: 'invoice', documentNumber: 'NF-1', documentDate: '2026-09-01',
        documentAmount: '400', createdAt: '2026-09-01T12:30:00Z', stores: [],
      }],
    });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Gerenciar compra CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    await user.click(within(dialog).getByRole('tab', { name: /Arquivos/ }));
    expect(within(dialog).getByText('Nota fiscal · 01/09/2026 · PED-1 · ativo · NF-1')).toBeInTheDocument();
  });

  it('nao oferece documento de reembolso no cadastro operacional de Compras', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Gerenciar compra CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Gerenciar compra · CMP-00001' });
    await user.click(within(dialog).getByRole('tab', { name: /Arquivos/ }));
    expect(within(dialog).queryByRole('option', { name: 'Documento de reembolso' })).not.toBeInTheDocument();
  });

  it('confirma de uma vez todas as lojas pendentes da compra', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Confirmar lojas CMP-00001 (1)' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar lojas · CMP-00001' });
    await user.type(within(dialog).getByLabelText('Quantidade realizada Cadeira operacional LOJ-001'), '2');
    await user.type(within(dialog).getByLabelText('Quantidade realizada Cadeira operacional LOJ-002'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar todas as lojas' }));
    expect(savePurchaseOrderLineDistributionV2).toHaveBeenCalledWith('line-1', [
      { storeId: 'store-1', quantity: '2' }, { storeId: 'store-2', quantity: '2' },
    ]);
  });

  it('resume compras por indicadores, lojas e prospectores/UF', async () => {
    const user = userEvent.setup();
    const profileItem: PurchaseItemV2 = { ...baseItem, destinations: [{
      id: 'profile-summary', purchaseItemId: 'item-1', sourceQuoteDestinationId: 'qd-summary', destinationType: 'profile', profileId: 'fp-summary', storeId: null, label: 'Valter Leandro', state: 'CE', destinationCount: 2,
      quantity: '10', unit: 'un', quotedShippingType: 'informed', quotedShippingAmount: '50', quotedDeliveryDays: 5, notes: null, position: 0, distributionStatus: 'confirmed', snapshotSource: 'approval',
      stores: [
        { id: 'ds-summary-1', purchaseDestinationId: 'profile-summary', storeId: 'store-1', code: 'LOJ-001', name: 'Loja Um', city: 'Fortaleza', state: 'CE', allocatedQuantity: '4', allocationSource: 'manual' },
        { id: 'ds-summary-2', purchaseDestinationId: 'profile-summary', storeId: 'store-2', code: 'LOJ-002', name: 'Loja Dois', city: 'Sobral', state: 'CE', allocatedQuantity: '6', allocationSource: 'manual' },
      ],
    }] };
    renderPage({ ...purchase, items: [profileItem] });
    await screen.findByText('CMP-00001');
    await user.click(screen.getByRole('button', { name: 'Resumo de compras' }));
    const dialog = screen.getByRole('dialog', { name: 'Resumo de compras' });
    expect(within(dialog).getByText('Realizado conhecido')).toBeInTheDocument();
    expect(within(dialog).getByText('Pagamentos pagos')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Lojas' }));
    expect(within(dialog).getByText('LOJ-001')).toBeInTheDocument();
    expect(within(dialog).getByText('LOJ-002')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Prospectores/UF' }));
    expect(within(dialog).getByText('Valter Leandro')).toBeInTheDocument();
    expect(within(dialog).getByText('CE')).toBeInTheDocument();
  });

  it('filtra por pendencia de distribuicao fisica', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');
    await user.selectOptions(screen.getByLabelText('Pendencia operacional'), 'line');
    expect(screen.getByText('CMP-00001')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Pendencia operacional'), 'destination');
    expect(screen.queryByText('CMP-00001')).not.toBeInTheDocument();
  });
});
