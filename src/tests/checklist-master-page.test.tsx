import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChecklistItem,
  createChecklistVersion,
  listChecklistItems,
  listChecklistVersions,
  publishChecklistVersion,
} from '../data/checklists/checklists-repository';
import { ChecklistMasterPage } from '../pages/checklist-master-page';

vi.mock('../data/checklists/checklists-repository', () => ({
  createChecklistVersion: vi.fn(),
  updateChecklistVersion: vi.fn(),
  publishChecklistVersion: vi.fn(),
  listChecklistVersions: vi.fn(),
  listChecklistItems: vi.fn(),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));

const version = {
  id: 'version-1',
  versionNumber: 1,
  name: 'Padrao inicial',
  status: 'draft' as const,
  notes: null,
  publishedAt: null,
  createdAt: '2026-08-16T00:00:00Z',
  itemCount: 1,
};
const item = {
  id: 'item-1',
  versionId: version.id,
  title: 'Validar projeto',
  description: null,
  category: 'Projeto',
  position: 10,
  isRequired: true,
  isActive: true,
  relativeDueDays: 5,
  guidance: null,
  responsibilityType: null,
  evidenceRequired: false,
  priority: 'normal' as const,
};

describe('ChecklistMasterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listChecklistVersions).mockResolvedValue([version]);
    vi.mocked(listChecklistItems).mockResolvedValue([item]);
  });

  it('carrega versao e publica o draft configurado', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChecklistMasterPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Validar projeto')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(publishChecklistVersion).toHaveBeenCalledWith('version-1');
  });

  it('cria uma nova versao com possibilidade de snapshot por clonagem', async () => {
    const user = userEvent.setup();
    vi.mocked(createChecklistVersion).mockResolvedValue('version-2');
    render(
      <MemoryRouter>
        <ChecklistMasterPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Nova versao' }));
    await user.type(screen.getByLabelText('Nome'), 'Padrao revisado');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Clonar itens de/ }),
      'version-1',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar versao' }));
    expect(createChecklistVersion).toHaveBeenCalledWith('Padrao revisado', '', 'version-1');
  });

  it('aceita offset negativo e explica a relacao com a inauguracao', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChecklistMasterPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Adicionar atividade' }));
    const offsetInput = screen.getByRole('spinbutton', { name: /Offset da inauguração/ });

    expect(offsetInput).toHaveAttribute('min', '-3650');
    expect(offsetInput).toHaveAttribute('max', '3650');
    expect(
      screen.getByText('Negativo: antes; 0: no dia da inauguração; positivo: depois.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Titulo'), 'Preparar abertura');
    await user.type(screen.getByLabelText('Categoria'), 'Planejamento');
    await user.clear(offsetInput);
    await user.type(offsetInput, '-30');
    await user.click(screen.getByRole('button', { name: 'Salvar atividade' }));

    expect(createChecklistItem).toHaveBeenCalledWith(
      version.id,
      expect.objectContaining({ relativeDueDays: -30 }),
    );
    expect(screen.queryByText('Prazo relativo (dias)')).not.toBeInTheDocument();
  });
});
