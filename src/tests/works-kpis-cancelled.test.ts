import { describe, expect, it } from 'vitest';
import { activeWorkServiceKpis, serviceTotals } from '../domain/works-calculations';
import type { WorkService } from '../domain/works-types';
import worksPage from '../pages/works-page.tsx?raw';

function makeService(
  code: string,
  status: WorkService['status'],
  budgetAmount: string,
  contractedAmount: string,
  paidAmount: string,
): WorkService {
  return {
    id: code,
    code,
    status,
    budgetAmount,
    contractedAmount,
    payments: [{ id: code + '-payment', status: 'paid', amount: paidAmount }],
    documents: [],
  } as WorkService;
}

describe('Obras e Serviços: indicadores operacionais sem serviços cancelados', () => {
  it('concilia os cinco KPIs apenas com os serviços não cancelados', () => {
    const services = [
      makeService('OBR-ATIVA', 'contracted', '1000.00', '900.00', '500.00'),
      makeService('OBR-CONCLUIDA', 'completed', '300.00', '200.00', '200.00'),
      makeService('OBR-CANCELADA-1', 'cancelled', '0.01', '0.01', '5000.00'),
      makeService('OBR-CANCELADA-2', 'cancelled', '0.00', '0.00', '3622.01'),
    ];

    expect(activeWorkServiceKpis(services)).toEqual({
      budgetCents: 130000n,
      contractedCents: 110000n,
      paidCents: 70000n,
      payableCents: 40000n,
      missingDocumentsCents: 110000n,
    });

    // Histórico mantido: a consulta individual ainda mostra o pagamento original.
    expect(serviceTotals(services[2]).paidCents).toBe(500000n);
    expect(serviceTotals(services[3]).paidCents).toBe(362201n);
    expect(services).toHaveLength(4);
    expect(services.filter((service) => service.status === 'cancelled')).toHaveLength(2);
  });

  it('não exibe valores históricos cancelados como compromissos ativos', () => {
    const cancelled = makeService('OBR-CANCELADA', 'cancelled', '0.01', '0.01', '8622.01');
    expect(activeWorkServiceKpis([cancelled])).toEqual({
      budgetCents: 0n,
      contractedCents: 0n,
      paidCents: 0n,
      payableCents: 0n,
      missingDocumentsCents: 0n,
    });
  });

  it('aplica o cálculo ao filtro atual da tela sem ocultar serviços cancelados da listagem', () => {
    expect(worksPage).toContain('activeWorkServiceKpis(filtered)');
    expect(worksPage).toContain('seus pagamentos e documentos continuam disponíveis na listagem para auditoria.');
    expect(worksPage).toContain('filtered.map((service)');
  });
});
