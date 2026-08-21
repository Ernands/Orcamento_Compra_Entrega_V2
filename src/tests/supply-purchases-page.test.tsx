import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../app/session-provider';
import {
  listSupplyPurchases,
  returnPurchaseToQuote,
  savePurchaseItem,
  savePurchasePayment,
  setPurchaseReimbursementStatus,
  type Purchase,
} from '../data/purchases/purchases-repository';
import { SupplyPurchasesPage } from '../pages/supply-purchases-page';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/purchases/purchases-repository', async () => {
  const actual = await vi.importActual('../data/purchases/purchases-repository');
  return {
    ...actual,
    listSupplyPurchases: vi.fn(),
    returnPurchaseToQuote: vi.fn(),
    savePurchaseItem: vi.fn(),
    savePurchasePayment: vi.fn(),
    setPurchaseReimbursementStatus: vi.fn(),
    uploadPurchaseAttachment: vi.fn(),
    createPurchaseAttachmentSignedUrl: vi.fn(),
    deletePurchaseAttachment: vi.fn(),
    validatePurchaseAttachment: vi.fn(),
  };
});

const purchase: Purchase = {
  id: 'purchase-1',
  code: 'CMP-00001',
  quoteId: 'quote-1',
  quoteCode: 'COT-00004',
  supplierId: 'supplier-1',
  supplierName: 'Fornecedor Teste',
  quoteDate: '2026-08-20',
  approvedTotal: '1200.00',
  hasPendingShipping: false,
  paymentMethodSnapshot: 'credit_card',
  entryAmountSnapshot: '200.00',
  installmentCountSnapshot: 5,
  paymentNotesSnapshot: 'Condicao aprovada',
  status: 'partially_purchased',
  reimbursementStatus: 'documents_pending',
  notes: null,
  approvedAt: '2026-08-21T12:00:00Z',
  returnedAt: null,
  stores: [
    {
      id: 'purchase-store-1',
      storeId: 'store-1',
      code: 'LOJ-001',
      name: 'Loja Um',
      city: 'Fortaleza',
      state: 'CE',
    },
    {
      id: 'purchase-store-2',
      storeId: 'store-2',
      code: 'LOJ-002',
      name: 'Loja Dois',
      city: 'Sobral',
      state: 'CE',
    },
  ],
  items: [
    {
      id: 'purchase-item-1',
      purchaseId: 'purchase-1',
      supplyItemId: 'item-1',
      itemCode: 'ITM-0001',
      itemName: 'Cadeira parcial',
      storeId: null,
      storeCode: null,
      quantityApproved: '10',
      purchasedQuantity: '4',
      unit: 'un',
      quotedUnitPrice: '100.00',
      approvedLineTotal: '1000.00',
      actualUnitPrice: '100.00',
      actualDiscountAmount: '0',
      actualShippingAmount: '0',
      actualOtherCosts: '0',
      notes: null,
    },
    {
      id: 'purchase-item-2',
      purchaseId: 'purchase-1',
      supplyItemId: 'item-2',
      itemCode: 'ITM-0002',
      itemName: 'Apoio concluido',
      storeId: 'store-1',
      storeCode: 'LOJ-001',
      quantityApproved: '2',
      purchasedQuantity: '2',
      unit: 'un',
      quotedUnitPrice: '100.00',
      approvedLineTotal: '200.00',
      actualUnitPrice: '100.00',
      actualDiscountAmount: '0',
      actualShippingAmount: '0',
      actualOtherCosts: '0',
      notes: null,
    },
  ],
  payments: [],
  attachments: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplyPurchasesPage />
    </MemoryRouter>,
  );
}

describe('SupplyPurchasesPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ can: () => true } as never);
    vi.mocked(listSupplyPurchases).mockResolvedValue([purchase]);
    vi.mocked(savePurchaseItem).mockResolvedValue();
    vi.mocked(savePurchasePayment).mockResolvedValue('payment-1');
    vi.mocked(setPurchaseReimbursementStatus).mockResolvedValue();
    vi.mocked(returnPurchaseToQuote).mockResolvedValue();
  });

  it('mostra aprovado, comprado, falta e filtra o resumo por falta comprar', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('CMP-00001')).toBeInTheDocument();
    expect(screen.getByText('2 lojas')).toBeInTheDocument();
    expect(screen.getByText(/Comprado: R\$ 600,00/)).toBeInTheDocument();
    expect(screen.getByText(/Falta: R\$ 600,00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver resumo CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Resumo CMP-00001' });
    expect(within(dialog).getByText('Cadeira parcial')).toBeInTheDocument();
    expect(within(dialog).getByText('Apoio concluido')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Falta comprar' }));
    expect(within(dialog).getByText('Cadeira parcial')).toBeInTheDocument();
    expect(within(dialog).queryByText('Apoio concluido')).not.toBeInTheDocument();
  });

  it('registra compra parcial com valores realizados', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');

    await user.click(screen.getByRole('button', { name: 'Editar compra de Cadeira parcial' }));
    const dialog = screen.getByRole('dialog', { name: /Registrar compra/ });
    const quantity = within(dialog).getByLabelText('Quantidade comprada');
    await user.clear(quantity);
    await user.type(quantity, '6');
    const unitPrice = within(dialog).getByLabelText('Valor unitario realizado');
    await user.clear(unitPrice);
    await user.type(unitPrice, '99,80');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar realizado' }));

    expect(savePurchaseItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'purchase-item-1',
        purchasedQuantity: '6',
        actualUnitPrice: '99,80',
      }),
    );
  });

  it('registra pagamento sem armazenar dados completos do cartao', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('CMP-00001');

    await user.click(screen.getByRole('button', { name: 'Pagamento CMP-00001' }));
    const dialog = screen.getByRole('dialog', { name: 'Pagamento · CMP-00001' });
    expect(within(dialog).getByText(/Nao informe numero completo do cartao nem CVV/)).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText('Origem / cartao utilizado'),
      'Cartao Corporativo final 1234',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pagamento' }));

    expect(savePurchasePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseId: 'purchase-1',
        paymentMethod: 'credit_card',
        sourceLabel: 'Cartao Corporativo final 1234',
        amount: '1200.00',
        entryAmount: '200.00',
        installmentCount: '5',
      }),
    );
  });
});
