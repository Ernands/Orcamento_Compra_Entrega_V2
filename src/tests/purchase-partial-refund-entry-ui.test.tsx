import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePartialAdjustmentPanel } from '../components/purchase-partial-adjustment-panel';
import type { PurchaseOrderV2, PurchaseV2 } from '../domain/purchase-v2-types';

function setup() {
  const lines = [
    { id: 'item-a', itemCode: 'ITM-0005', itemName: 'Armário baixo com chave',
      quantity:'1', unit:'un', lineTotal: '516.90', shippingAmount: '89.48', storeDistributionStatus:'confirmed' },
    { id: 'item-b', itemCode: 'ITM-0020', itemName: 'Mesa Escritório negocial',
      quantity:'1', unit:'un', lineTotal: '495.84', shippingAmount: '85.84', storeDistributionStatus:'confirmed' },
    { id: 'item-c', itemCode: 'ITM-0064', itemName: 'Mesa de videoatendimento',
      quantity:'1', unit:'un', lineTotal: '766.73', shippingAmount: '300.00', storeDistributionStatus:'confirmed' },
  ];
  const order = { id:'order-1', status:'active', lines } as unknown as PurchaseOrderV2;
  const purchase = {
    id:'purchase-1',code:'CMP-TESTE',orders:[order],
    stores:[{storeId:'store-1'}],
    payments:[{ id:'paid-1',status:'paid',amount:'1779.47',purchaseOrderId:'order-1' }],
    attachments:[],
  } as unknown as PurchaseV2;
  render(<PurchasePartialAdjustmentPanel purchase={purchase} order={order}
    canEdit onSaved={vi.fn()} onAttachRefundProof={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: /Ajustar compra/}));
  return {purchase,order};
}

describe('lançamentos de crédito por item', () => {
  it('soma vários reembolsos com datas e mostra comprovante de crédito ausente', () => {
    setup();
    fireEvent.click(screen.getByLabelText(/Armário baixo com chave/));
    fireEvent.click(screen.getByLabelText(/Mesa Escritório negocial/));
    fireEvent.click(screen.getByRole('button',{name:'Adicionar reembolso'}));
    fireEvent.change(screen.getByLabelText('Valor do reembolso 1'),{target:{value:'516,90'}});
    fireEvent.click(screen.getByRole('button',{name:'Adicionar reembolso'}));
    fireEvent.change(screen.getByLabelText('Valor do reembolso 2'),{target:{value:'703,50'}});
    expect(screen.getAllByText('R$ 1.220,40').length).toBeGreaterThan(0);
    expect(screen.getByText(/Nenhum documento de reembolso anexado/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Confirmar cancelamento/})).toBeDisabled();
  });

  it('admite frete não restituído dos itens cancelados dentro do frete original', () => {
    setup();
    fireEvent.click(screen.getByLabelText(/Armário baixo com chave/));
    fireEvent.click(screen.getByLabelText(/Mesa de videoatendimento/));
    fireEvent.click(screen.getByRole('button',{name:'Adicionar reembolso'}));
    fireEvent.change(screen.getByLabelText('Valor do reembolso 1'),{target:{value:'516,90'}});
    fireEvent.click(screen.getByRole('button',{name:'Adicionar reembolso'}));
    fireEvent.change(screen.getByLabelText('Valor do reembolso 2'),{target:{value:'703,50'}});
    expect(screen.getByText(/AJ-FRETE/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$ 63,23/).length).toBeGreaterThan(0);
    expect(screen.getByText(/custo residual de frete dos itens cancelados/)).toBeInTheDocument();
    // Ainda exige comprovante, referência, justificativa e confirmação documental.
    expect(screen.getByRole('button',{name:/Confirmar cancelamento/})).toBeDisabled();
  });
});
