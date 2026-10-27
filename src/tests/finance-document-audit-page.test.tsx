import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizedHomePath } from '../app/guards';
import { FinanceDocumentAuditPage } from '../pages/finance-document-audit-page';
import { useSession } from '../app/session-provider';
import { listAuditStores } from '../data/finance/document-audit-repository';
import { listSupplyPurchasesV2 } from '../data/purchases/purchases-v2-repository';
import { listWorkServices } from '../data/works/works-repository';
import type { WorkService } from '../domain/works-types';
import { auditStore } from './fixtures/document-audit';

vi.mock('../app/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('../data/finance/document-audit-repository', () => ({ listAuditStores: vi.fn() }));
vi.mock('../data/purchases/purchases-v2-repository', () => ({
  listSupplyPurchasesV2: vi.fn(),
  createPurchaseAttachmentSignedUrlV2: vi.fn(),
}));
vi.mock('../data/works/works-repository', () => ({
  listWorkServices: vi.fn(),
  createWorkDocumentSignedUrl: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({
    can: (capability: string) =>
      ['finance.view', 'finance.document_audit_view'].includes(capability),
  } as ReturnType<typeof useSession>);
  vi.mocked(listAuditStores).mockResolvedValue([
    auditStore,
    { ...auditStore, id: 'store-b', code: 'LOJ-B', city: 'Acaraú' },
  ]);
  vi.mocked(listSupplyPurchasesV2).mockResolvedValue([]);
  vi.mocked(listWorkServices).mockResolvedValue([
    {
      id: 'w1',
      code: 'OBR-TESTE',
      storeId: 'store-a',
      status: 'contracted',
      providerName: 'Fornecedor',
      contractedAmount: '100.00',
      budgetAmount: '120.00',
      description: 'Serviço sem pagamentos',
      payments: [],
      documents: [],
      components: [],
    } as unknown as WorkService,
  ]);
});
describe('seleção e acesso da conferência', () => {
  it('carrega todas as páginas, permite seleção e limpa seleção ao mudar de loja', async () => {
    const user = userEvent.setup();
    render(<FinanceDocumentAuditPage />);
    const select = screen.getByLabelText('Loja');
    await waitFor(() => expect(select).toBeEnabled());
    expect(listSupplyPurchasesV2).toHaveBeenCalledWith({ allRows: true });
    expect(listWorkServices).toHaveBeenCalledWith({ allRows: true });
    await user.selectOptions(select, 'store-a');
    expect(screen.getByText('Serviço sem pagamentos')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Gerar conferência/ });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Selecionar todos' }));
    expect(button).toBeEnabled();
    await user.selectOptions(select, 'store-b');
    expect(button).toBeDisabled();
    expect(screen.queryByText('Serviço sem pagamentos')).not.toBeInTheDocument();
  });
  it('direciona o usuário com acesso exclusivo à conferência para a nova tela', () => {
    expect(authorizedHomePath(['finance.view', 'finance.document_audit_view'])).toBe(
      '/financeiro/conferencia-compras-obras',
    );
  });
  it('não consulta dados sem as duas permissões necessárias', () => {
    vi.mocked(useSession).mockReturnValue({
      can: (capability: string): boolean => capability === 'finance.view',
    } as ReturnType<typeof useSession>);
    render(<FinanceDocumentAuditPage />);
    expect(screen.getByText('Acesso à conferência não permitido')).toBeInTheDocument();
    expect(listAuditStores).not.toHaveBeenCalled();
    expect(listWorkServices).not.toHaveBeenCalled();
  });
});
