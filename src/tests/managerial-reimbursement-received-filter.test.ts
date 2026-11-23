import { describe, expect, it } from 'vitest';
import {
  filterManagerialReimbursements, managerialTotals,
  type ManagerialReimbursementFilter, type ManagerialReimbursementRow,
  type ReimbursementStatus,
} from '../domain/managerial-reimbursements';
import page from '../pages/managerial-reimbursement-page.tsx?raw';

function row(
  code: string, state: string, status: ReimbursementStatus, receivedCents: bigint,
): ManagerialReimbursementRow {
  return {
    storeId: code, code, name: code, city: 'Cidade', state,
    storeStatus: status === 'finalized' ? 'Finalizada' : 'Ativa',
    bbCents: 5000000n, realizedTotalCents: 4800000n,
    varianceToBbCents: 200000n, requestedCents: 5000000n,
    receivedCents, absorbedCents: 0n, pendingCents: 0n,
    extraCents: 0n, eligibleCents: 4800000n,
    recordedLossCents: 0n, disbursementCents: 0n,
    reimbursementStatus: status, events: [],
  };
}

const waveOne = [
  row('LOJ-006', 'CE', 'finalized', 5000000n),
  row('LOJ-025', 'PE', 'finalized', 5000000n),
  row('LOJ-009', 'MG', 'partial', 180000n),
  row('LOJ-010', 'MG', 'received', 230000n),
  row('LOJ-011', 'CE', 'requested', 0n),
  // Recebimento integralmente estornado: sem valor líquido recebido.
  row('LOJ-012', 'CE', 'divergent', 0n),
  row('LOJ-013', 'CE', 'divergent', -5000n),
];
const waveTwo = [
  row('LOJ-029', 'CE', 'received', 700000n),
  row('LOJ-030', 'MG', 'requested', 0n),
];

function select(
  rows: ManagerialReimbursementRow[], status: ManagerialReimbursementFilter,
  uf = '', storeId = '',
) {
  return filterManagerialReimbursements(rows, { status, uf, storeId });
}

describe('Gerencial de Reembolso — filtro Com reembolso recebido', () => {
  it('inclui finalizadas, parciais e reembolsadas sem mudar seus status', () => {
    const selected = select(waveOne, 'with_received');
    expect(selected.map((item) => item.code)).toEqual([
      'LOJ-006', 'LOJ-025', 'LOJ-009', 'LOJ-010',
    ]);
    expect(selected[0].reimbursementStatus).toBe('finalized');
    expect(selected[1].reimbursementStatus).toBe('finalized');
    expect(managerialTotals(selected).receivedCents).toBe(10410000n);
  });

  it('mantém Reembolsado e Finalizado como filtros exatos independentes', () => {
    expect(select(waveOne, 'received').map((item) => item.code)).toEqual(['LOJ-010']);
    expect(select(waveOne, 'finalized').map((item) => item.code))
      .toEqual(['LOJ-006', 'LOJ-025']);
    expect(select(waveOne, 'partial').map((item) => item.code)).toEqual(['LOJ-009']);
    expect(select(waveOne, 'all')).toHaveLength(waveOne.length);
  });

  it('exclui lançamentos integralmente estornados ou com recebimento líquido negativo', () => {
    const selected = select(waveOne, 'with_received');
    expect(selected.map((r) => r.code)).not.toContain('LOJ-012');
    expect(selected.map((r) => r.code)).not.toContain('LOJ-013');
    expect(selected.map((r) => r.code)).not.toContain('LOJ-011');
  });

  it('respeita loja e UF, sem que filtros alterem os totais das demais lojas', () => {
    expect(select(waveOne, 'with_received', 'CE').map((r) => r.code)).toEqual(['LOJ-006']);
    expect(select(waveOne, 'with_received', '', 'LOJ-025').map((r) => r.code))
      .toEqual(['LOJ-025']);
    expect(select(waveOne, 'with_received', 'MG', 'LOJ-006')).toEqual([]);
    expect(managerialTotals(select(waveOne, 'with_received', 'PE')).receivedCents)
      .toBe(5000000n);
  });

  it('respeita o recorte por onda fornecido pelo repositório', () => {
    expect(select(waveOne, 'with_received').map((r) => r.code)).not.toContain('LOJ-029');
    expect(select(waveTwo, 'with_received').map((r) => r.code)).toEqual(['LOJ-029']);
    expect(managerialTotals(select([...waveOne, ...waveTwo], 'with_received')).receivedCents)
      .toBe(11110000n);
    expect(select([], 'with_received')).toEqual([]);
  });

  it('exibe a opção adicional no seletor e aplica o filtro também aos cards e CSV', () => {
    expect(page).toContain('<option value="with_received">Com reembolso recebido</option>');
    expect(page).toContain('filterManagerialReimbursements(allRows,{uf,storeId,status})');
    expect(page).toContain('managerialTotals(shown)');
    expect(page).toContain('...shown.map(r=>');
    expect(page).toContain('shown.map(r=><tr');
  });
});
