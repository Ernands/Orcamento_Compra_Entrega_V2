import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FinanceTablePager } from '../components/finance-table-pager';
import { financeTablePage } from '../domain/finance-table-pagination';

const allPayments = Array.from({ length: 123 }, (_, i) => ({
  id: 'payment-' + i,
  label: 'Pagamento ' + (i + 1),
}));

function PaymentsHarness() {
  const [page, setPage] = useState(1);
  const result = financeTablePage(allPayments, page);
  return (
    <>
      <div data-testid="visible-payments">
        {result.items.map((item) => <p key={item.id}>{item.label}</p>)}
      </div>
      <FinanceTablePager page={result.page} pageCount={result.pageCount}
        total={result.total} label="pagamentos" onPageChange={setPage} />
    </>
  );
}

describe('paginação funcional dos pagamentos', () => {
  it('navega entre 123 pagamentos sem repetir ou omitir linhas', () => {
    render(<PaymentsHarness />);
    const visible = within(screen.getByTestId('visible-payments'));
    expect(visible.getAllByText(/Pagamento /)).toHaveLength(50);
    expect(visible.getByText('Pagamento 1')).toBeInTheDocument();
    expect(visible.queryByText('Pagamento 51')).not.toBeInTheDocument();
    expect(screen.getByText('Exibindo 1–50 de 123 pagamentos · Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(visible.getAllByText(/Pagamento /)).toHaveLength(50);
    expect(visible.getByText('Pagamento 51')).toBeInTheDocument();
    expect(visible.getByText('Pagamento 100')).toBeInTheDocument();
    expect(visible.queryByText('Pagamento 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(visible.getAllByText(/Pagamento /)).toHaveLength(23);
    expect(visible.getByText('Pagamento 101')).toBeInTheDocument();
    expect(visible.getByText('Pagamento 123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(visible.getByText('Pagamento 51')).toBeInTheDocument();
    expect(allPayments).toHaveLength(123);
  });

  it('oculta o paginador se uma filtragem resultar em apenas uma página', () => {
    const onPageChange = () => { throw new Error('Não deveria haver navegação'); };
    render(<FinanceTablePager page={1} pageCount={1} total={7}
      label="pagamentos" onPageChange={onPageChange} />);
    expect(screen.queryByRole('navigation', { name: 'Paginação de pagamentos' })).not.toBeInTheDocument();
  });
});
