import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSupplyItems,
  listSupplyNeeds,
  listSupplyQuotes,
} from '../data/supplies/supplies-repository';
import { SupplyComparisonPage } from '../pages/supply-comparison-page';

vi.mock('../data/supplies/supplies-repository', () => ({
  listSupplyItems: vi.fn(),
  listSupplyNeeds: vi.fn(),
  listSupplyQuotes: vi.fn(),
}));

describe('SupplyComparisonPage status dropdown', () => {
  beforeEach(() => {
    vi.mocked(listSupplyQuotes).mockResolvedValue([]);
    vi.mocked(listSupplyItems).mockResolvedValue([]);
    vi.mocked(listSupplyNeeds).mockResolvedValue([]);
  });

  it('fecha ao clicar fora, pressionar Escape ou usar um atalho', async () => {
    const user = userEvent.setup();
    render(<SupplyComparisonPage />);
    await screen.findByText('Nenhuma alternativa encontrada');

    const summary = screen.getByLabelText('Filtrar status no comparativo');
    const details = summary.closest('details');
    expect(details).not.toBeNull();

    await user.click(summary);
    expect(details).toHaveAttribute('open');

    await user.click(screen.getByLabelText('Filtrar item no comparativo'));
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    await user.keyboard('{Escape}');
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(details).not.toHaveAttribute('open');
  });
});
