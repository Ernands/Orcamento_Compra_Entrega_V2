import { describe, expect, it } from 'vitest';
import page from '../pages/finance-payments-page.tsx?raw';
import modal from '../components/finance-reimbursement-modal.tsx?raw';
import exporter from '../data/exports/finance-reimbursement-export.ts?raw';
import paymentsCss from '../pages/finance-payments-page.css?raw';

describe('integração UI reembolso', () => {
  it('insere botão de reembolso com dados completos, independentemente da aba ativa', () => {
    expect(page).toContain('Gerar Solicitação de Reembolso');
    expect(page).toContain('rows={rows}');
    expect(page).toContain('initialStoreId={storeFilter}');
    expect(page).toContain('<span className="finance-payment-meta-label">Nota/Recibo</span>');
    expect(page).toContain('fiscalStateForPayment(');
    expect(modal).toContain('reimbursementEligibleStoreIds(rows)');
    expect(modal).toContain('eligibleIds.has(store.id)');
    expect(modal).not.toContain('INITIAL_STORE_CODES');
  });
  it('apresenta ações e nota/recibo abaixo dos detalhes sem rolagem horizontal em desktop', () => {
    const section = page.split('<section className="finance-payments-panel">')[1];
    expect(section).toContain('<Fragment key={row.id}>');
    expect(section).toContain("finance-payment-info-row ${index % 2 === 1 ? 'finance-payment-entry--striped' : ''}");
    expect(section).toContain("finance-payment-meta-row ${index % 2 === 1 ? 'finance-payment-entry--striped' : ''}");
    expect(section).toContain('<td colSpan={7}>');
    expect(section).toContain('finance-payment-meta-status');
    expect(section).toContain('finance-payment-actions');
    expect(section).toContain('FinancePaymentDatesAction');
    expect(section).toContain('openPlannedEdit(row)');
    expect(section).toContain('setDocumentsRow(row)');
    expect(section).toContain('originHref(row)');
    expect(section).toContain('financePaymentLatestDate(row)');
    expect(section).not.toContain('finance-payments-actions-heading');
    expect(section).not.toContain('finance-payments-actions-cell');
    expect(paymentsCss).toContain('table-layout: fixed');
    expect(paymentsCss).toContain('.finance-payment-meta-bar .finance-payment-actions');
    expect(paymentsCss).toContain('@media (max-width: 980px)');
    expect(paymentsCss).not.toContain('min-width: 1350px');
  });
  it('expõe as pendências por OBR antes de gerar e mantém o botão de exportação independente delas', () => {
    expect(modal).toContain('report.pendingWorks.map((pending)');
    expect(modal).toContain('pending.issues.map((issue, index)');
    expect(modal).toContain('Pendências identificadas em Obras e Serviços');
    expect(modal).toContain('<th>Pendência identificada</th>');
    expect(modal).toContain('line.workDocumentationIssues.join');
    expect(modal).toContain('disabled={generating || !report.lines.length || !report.sumMatches}');
    expect(paymentsCss).toContain('.finance-reimbursement-work-pendencies__list');
    expect(exporter).toContain('const workIssues = new Map<string, string[]>();');
    expect(exporter).toContain('OBRs com pendências documentais');
    expect(exporter).toContain("Obras/serviços com documentação incompleta:");
  });
  it('gera ZIP com documentos disponíveis e registra arquivos ausentes', () => {
    expect(exporter).toContain("await import('jszip')");
    expect(exporter).toContain("compression: 'DEFLATE'");
    expect(exporter).toContain("workbook.addWorksheet('Pendências Documentais',");
    expect(exporter).toContain("workbook.addWorksheet('Arquivos do ZIP',");
    expect(exporter).toContain("zip.file('Abrir_Arquivos.html'");
    expect(exporter).toContain("zip.file('LEIA-ME.txt'");
    expect(exporter).toContain("fiscalLabel(line)");
    expect(exporter).toContain("const unavailable = new Set<string>()");
  });
  it('mostra progresso dos anexos do ZIP e usa downloads paralelos limitados', () => {
    expect(modal).toContain('onProgress: (completed, total) => setDownloadProgress({ completed, total })');
    expect(modal).toContain('Obtendo anexos: {downloadProgress.completed} de {downloadProgress.total}');
    expect(modal).toContain('setDownloadProgress(null)');
    expect(paymentsCss).toContain('.finance-reimbursement-progress');
    expect(exporter).toContain('MAX_PARALLEL_REIMBURSEMENT_DOWNLOADS = 4');
    expect(exporter).toContain('fetchReimbursementZipAttachments(');
    expect(exporter).toContain('input.onProgress');
  });
});
