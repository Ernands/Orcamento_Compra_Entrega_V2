import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BankReconciliationWaveGate } from '../app/bank-reconciliation-wave-gate';
import { useWaveScope } from '../app/wave-scope';

vi.mock('../app/wave-scope', () => ({ useWaveScope: vi.fn() }));

describe('Conciliação Conta e filtros por onda', () => {
  it('não carrega o demonstrativo bancário ao selecionar apenas uma onda', async () => {
    const user = userEvent.setup();
    const setSelection = vi.fn();
    vi.mocked(useWaveScope).mockReturnValue({
      selected: [1],
      waves: [],
      key: '1',
      refresh: vi.fn(),
      setSelection,
    });
    render(<BankReconciliationWaveGate><div>Saldo global real</div></BankReconciliationWaveGate>);
    expect(screen.getByText(/Selecione Todas as ondas/)).toBeInTheDocument();
    expect(screen.queryByText('Saldo global real')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Consultar conciliação/ }));
    expect(setSelection).toHaveBeenCalledWith(null);
  });

  it('preserva a conciliação bancária completa para todas as ondas', () => {
    vi.mocked(useWaveScope).mockReturnValue({
      selected: null,
      waves: [],
      key: 'all',
      refresh: vi.fn(),
      setSelection: vi.fn(),
    });
    render(<BankReconciliationWaveGate><div>Saldo global real</div></BankReconciliationWaveGate>);
    expect(screen.getByText('Saldo global real')).toBeInTheDocument();
  });
});
