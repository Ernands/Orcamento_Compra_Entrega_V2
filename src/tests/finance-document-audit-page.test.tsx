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
    // Never fetch all purchases and works just to render the store selector.
    expect(listSupplyPurchasesV2).not.toHaveBeenCalled();
    expect(listWorkServices).not.toHaveBeenCalled();
    await user.selectOptions(select, 'store-a');
    await waitFor(() => expect(listSupplyPurchasesV2).toHaveBeenCalledWith({
      allRows: true, storeId: 'store-a',
    }));
    expect(listWorkServices).toHaveBeenCalledWith({
      allRows: true, includeComponents: true, storeId: 'store-a',
    });
    expect(await screen.findByText('Serviço sem pagamentos')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Gerar conferência/ });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Selecionar todos' }));
    expect(button).toBeEnabled();
    await user.selectOptions(select, 'store-b');
    expect(button).toBeDisabled();
    await waitFor(() => expect(listSupplyPurchasesV2).toHaveBeenCalledWith({
      allRows: true, storeId: 'store-b',
    }));
    expect(listWorkServices).toHaveBeenCalledWith({
      allRows: true, includeComponents: true, storeId: 'store-b',
    });
    await waitFor(() => expect(screen.queryByText('Serviço sem pagamentos')).not.toBeInTheDocument());
    await user.selectOptions(select, 'store-a');
    expect(await screen.findByText('Serviço sem pagamentos')).toBeInTheDocument();
    // Per-user cache avoids a second RLS query when revisiting a loaded store.
    expect(listSupplyPurchasesV2).toHaveBeenCalledTimes(2);
    expect(listWorkServices).toHaveBeenCalledTimes(2);
  });
  it('alerta sobre recibo cadastrado sem arquivo, antes de permitir a conferência', async () => {
    vi.mocked(listWorkServices).mockResolvedValue([{
      id: 'w1',
      code: 'OBR-TESTE',
      storeId: 'store-a',
      status: 'contracted',
      providerName: 'Prestador',
      contractedAmount: '100.00',
      budgetAmount: '120.00',
      description: 'Serviço de instalação',
      payments: [],
      documents: [{
        id: 'document-without-file',
        documentType: 'receipt',
        status: 'verified',
        storagePath: null,
        originalName: null,
        documentAmount: '100.00',
      }],
      components: [],
    } as unknown as WorkService]);

    const user = userEvent.setup();
    render(<FinanceDocumentAuditPage />);
    const storeSelect = screen.getByLabelText('Loja');
    await waitFor(() => expect(storeSelect).toBeEnabled());
    await user.selectOptions(storeSelect, 'store-a');

    expect(await screen.findByText('Sem arquivo fiscal vinculado')).toBeInTheDocument();
    expect(screen.getByText('1 cadastro(s) sem arquivo — regularizar')).toBeInTheDocument();
    expect(screen.queryByText(/Atenção: 1 documento\(s\)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar OBR-TESTE' }));
    expect(screen.getByText(/Atenção: 1 documento\(s\) cadastrado\(s\) sem arquivo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar conferência/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.queryByText(/Atenção: 1 documento\(s\)/)).not.toBeInTheDocument();
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
