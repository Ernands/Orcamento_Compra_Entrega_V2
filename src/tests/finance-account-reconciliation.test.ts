import { describe, expect, it } from 'vitest';
import {
  buildFinanceAccountConsolidated,
  buildFinanceAccountDaySummaries,
  type FinanceAccountDayRecord,
  type FinanceAccountManualEntry,
  type FinanceAccountPaymentEvent,
} from '../domain/finance-account-reconciliation';

describe('conciliação da conta', () => {
  it('concilia pagamentos por data com acertos e calcula saldo acumulado', () => {
    const payments: FinanceAccountPaymentEvent[] = [
      {
        id: 'p1',
        date: '2026-10-01',
        amountCents: 100000n,
        reference: 'CMP-1',
        counterpart: 'Fornecedor',
        description: 'Item',
        paymentMethod: 'pix',
        sourceLabel: null,
        storeIds: [],
        storeCodes: [],
        states: [],
        sourceHref: '/suprimentos/compras',
      },
      {
        id: 'p2',
        date: '2026-10-02',
        amountCents: 25000n,
        reference: 'OBR-1',
        counterpart: 'Prestador',
        description: 'Serviço',
        paymentMethod: 'pix',
        sourceLabel: null,
        storeIds: [],
        storeCodes: [],
        states: [],
        sourceHref: '/obras',
      },
    ];
    const records: FinanceAccountDayRecord[] = [
      {
        id: 'd1',
        date: '2026-10-01',
        bankPaymentsCents: 99500n,
        bankBalanceCents: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'd2',
        date: '2026-10-02',
        bankPaymentsCents: 25000n,
        bankBalanceCents: 75500n,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const entries: FinanceAccountManualEntry[] = [
      {
        id: 'i1',
        date: '2026-10-01',
        type: 'investment',
        amountCents: 200000n,
        reason: 'Aporte',
        notes: null,
        status: 'active',
        cancellationReason: null,
        cancelledAt: null,
        createdAt: '',
        updatedAt: '',
        attachments: [],
      },
      {
        id: 'a1',
        date: '2026-10-01',
        type: 'adjustment_credit',
        amountCents: 500n,
        reason: 'Devolução',
        notes: null,
        status: 'active',
        cancellationReason: null,
        cancelledAt: null,
        createdAt: '',
        updatedAt: '',
        attachments: [],
      },
    ];

    const days = buildFinanceAccountDaySummaries(payments, records, entries);
    expect(days[0].differenceCents).toBe(0n);
    expect(days[0].status).toBe('reconciled');
    expect(days[1].expectedBalanceCents).toBe(75500n);
    expect(days[1].balanceDifferenceCents).toBe(0n);

    const consolidated = buildFinanceAccountConsolidated(days);
    expect(consolidated.investmentCents).toBe(200000n);
    expect(consolidated.systemPaymentsCents).toBe(125000n);
    expect(consolidated.adjustmentCreditCents).toBe(500n);
    expect(consolidated.expectedBalanceCents).toBe(75500n);
    expect(consolidated.balanceDifferenceCents).toBe(0n);
  });

  it('mantém o dia pendente enquanto o movimento BB não for informado', () => {
    const days = buildFinanceAccountDaySummaries([
      {
        id: 'p1',
        date: '2026-10-01',
        amountCents: 100n,
        reference: 'CMP',
        counterpart: 'Fornecedor',
        description: 'Item',
        paymentMethod: 'pix',
        sourceLabel: null,
        storeIds: [],
        storeCodes: [],
        states: [],
        sourceHref: '/suprimentos/compras',
      },
    ], [], []);

    expect(days[0].status).toBe('pending');
    expect(days[0].differenceCents).toBeNull();
  });
});
