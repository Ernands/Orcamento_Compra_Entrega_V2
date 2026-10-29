import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminReferenceAuditPage } from '../pages/admin-reference-audit-page';
import { lookupReferenceAudit } from '../data/admin/reference-audit-repository';

vi.mock('../data/admin/reference-audit-repository', () => ({
  lookupReferenceAudit: vi.fn(),
}));

describe('AdminReferenceAuditPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('valida o código e não chama o banco em buscas inválidas', () => {
    render(<AdminReferenceAuditPage />);
    fireEvent.change(screen.getByLabelText('Código da OBR ou CMP'), { target: { value: '00320' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um código válido');
    expect(lookupReferenceAudit).not.toHaveBeenCalled();
  });

  it('exibe autor, data, nome dos anexos e atos da trilha sem editar dados', async () => {
    vi.mocked(lookupReferenceAudit).mockResolvedValue({
      code: 'OBR-00320', kind: 'OBR', createdAt: '2026-10-23T15:28:36Z',
      createdBy: 'Usuário de teste', creatorBasis: 'Autor do cadastro',
      location: 'CLAUDIO/MG', status: 'contracted',
      files: [{ id: 'file-1', name: 'nota.pdf', type: 'invoice',
        uploadedBy: 'Usuário de teste', uploadedAt: '2026-10-27T12:23:33Z',
        deleted: false, deletedAt: null, number: null }],
      events: [{ id: 'evt-1', fileId: 'file-1', action: 'works.insert', at: '2026-10-27T12:23:33Z',
        by: 'Usuário de teste', name: 'nota.pdf', previousName: null, nextName: 'nota.pdf',
        previousType: null, nextType: 'invoice', fileChanged: true }],
    });
    render(<AdminReferenceAuditPage />);
    fireEvent.change(screen.getByLabelText('Código da OBR ou CMP'), { target: { value: 'obr-00320' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    await waitFor(() => expect(lookupReferenceAudit).toHaveBeenCalledWith('OBR-00320'));
    expect(screen.getByText('Dados de criação · OBR-00320')).toBeInTheDocument();
    expect(screen.getByText('27/10/2026, 09:23:33')).toBeInTheDocument();
    expect(screen.getAllByText('nota.pdf')).toHaveLength(2);
    expect(screen.getByText('Arquivo anexado')).toBeInTheDocument();
  });

  it('distingue código inexistente de acesso recusado', async () => {
    vi.mocked(lookupReferenceAudit).mockResolvedValue(null);
    render(<AdminReferenceAuditPage />);
    fireEvent.change(screen.getByLabelText('Código da OBR ou CMP'), { target: { value: 'CMP-99999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('Nenhum lançamento localizado para esse código.')).toBeInTheDocument();
  });
});
