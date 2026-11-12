import { FINANCE_TABLE_PAGE_SIZE } from '../domain/finance-table-pagination';

interface FinanceTablePagerProps {
  page: number;
  pageCount: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
  pageSize?: number;
}

export function FinanceTablePager({
  page,
  pageCount,
  total,
  label,
  onPageChange,
  pageSize = FINANCE_TABLE_PAGE_SIZE,
}: FinanceTablePagerProps) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label={`Paginação de ${label}`}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, marginTop: 16, marginBottom: 12 }}
    >
      <span aria-live="polite">
        Exibindo {first}–{last} de {total} {label} · Página {page} de {pageCount}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="button button--secondary button--small"
          disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </button>
        <button type="button" className="button button--secondary button--small"
          disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Próxima
        </button>
      </div>
    </nav>
  );
}
