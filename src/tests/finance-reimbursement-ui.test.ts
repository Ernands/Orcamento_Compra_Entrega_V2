import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';
import modal from '../components/finance-reimbursement-modal.tsx?raw';
import exporter from '../data/exports/finance-reimbursement-export.ts?raw';

describe('integração UI reembolso', () => {
  it('insere botão de reembolso com dados completos, independentemente da aba ativa', () => {
    expect(page).toContain('Gerar Solicitação de Reembolso');
    expect(page).toContain('rows={rows}');
    expect(page).toContain('initialStoreId={storeFilter}');
    expect(page).toContain('<th>Nota/Recibo</th>');
    expect(page).toContain('fiscalStateForPayment(');
    expect(modal).toContain("['LOJ-001', 'LOJ-006', 'LOJ-025']");
  });
  it('gera ZIP com documentos disponíveis e registra arquivos ausentes', () => {
    expect(exporter).toContain("await import('jszip')");
    expect(exporter).toContain("compression: 'DEFLATE'");
    expect(exporter).toContain("workbook.addWorksheet('Pendências Documentais')");
    expect(exporter).toContain("zip.file('LEIA-ME.txt'");
    expect(exporter).toContain("fiscalLabel(line)");
    expect(exporter).toContain("const unavailable = new Set<string>()");
  });
});
