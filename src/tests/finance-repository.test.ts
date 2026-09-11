import { describe, expect, it } from 'vitest';
import { buildFinanceReimbursementRpcPayload } from '../data/finance/finance-repository';

describe('buildFinanceReimbursementRpcPayload', () => {
  it('normaliza textos e preserva os valores de cada compra', () => {
    expect(
      buildFinanceReimbursementRpcPayload({
        id: null,
        storeId: 'store-1',
        status: 'requested',
        protocol: ' PROT-10 ',
        notes: ' Aguardando banco ',
        items: [
          {
            purchaseId: 'purchase-1',
            purchaseOrderId: 'order-1',
            eligibleAmount: '100.25',
            requestedAmount: '90.25',
            approvedAmount: '',
            receivedAmount: '',
            notes: ' Nota da compra ',
          },
        ],
      }),
    ).toEqual({
      p_reimbursement_id: null,
      p_store_id: 'store-1',
      p_status: 'requested',
      p_protocol: 'PROT-10',
      p_notes: 'Aguardando banco',
      p_items: [
        {
          purchase_id: 'purchase-1',
          purchase_order_id: 'order-1',
          eligible_amount: '100.25',
          requested_amount: '90.25',
          approved_amount: '0',
          received_amount: '0',
          notes: 'Nota da compra',
        },
      ],
    });
  });
});
