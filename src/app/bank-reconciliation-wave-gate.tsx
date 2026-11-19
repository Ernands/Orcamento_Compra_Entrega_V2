import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWaveScope } from './wave-scope';

/**
 * Bank statement days and manual adjustments are ACCOUNT-WIDE, not attributed
 * to lojas. Combining those totals with a wave-filtered purchase feed would
 * fabricate a reconciliation difference. Never fetch or display such a mix.
 */
export function BankReconciliationWaveGate({ children }: { children: ReactNode }) {
  const { selected, setSelection } = useWaveScope();
  if (selected === null) return <>{children}</>;
  return (
    <section className="page-stack" aria-label="Conciliação bancária global">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h2>Conciliação Conta</h2>
          <p>Conciliação bancária é um demonstrativo da conta inteira.</p>
        </div>
      </header>
      <div className="empty-state" role="status">
        <AlertTriangle size={22} aria-hidden="true" />
        <h3>Selecione Todas as ondas para conciliar a conta</h3>
        <p>
          O extrato, o saldo bancário e os ajustes manuais não possuem
          identificação de onda ou loja. Compará-los apenas com pagamentos
          de uma onda produziria diferenças incorretas.
          Por segurança, esta consulta global fica indisponível com ondas específicas.
          As telas Pagamentos, Obras, Compras e os relatórios por loja continuam filtrados.
        </p>
        <button type="button" className="button button--primary"
          onClick={() => setSelection(null)}>
          Consultar conciliação de todas as ondas
        </button>
      </div>
    </section>
  );
}
