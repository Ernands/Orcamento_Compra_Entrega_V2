import {
  ArrowLeft,
  Boxes,
  Calculator,
  Layers3,
  MapPin,
  Store as StoreIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, InlineLoading } from '../components/ui';
import { listPlannedBudget } from '../data/planned-budget/planned-budget-repository';
import { plannedBudgetItemTotalCents } from '../domain/planned-budget-calculations';
import type { PlannedBudgetItem } from '../domain/planned-budget-types';
import { formatQuantityV2 } from '../domain/purchase-v2-calculations';
import { formatBRL, moneyToCents, quantityToThousandths } from '../domain/supply-calculations';
import type { SupplyItem } from '../domain/types';
import './supply-planned-budget-page.css';

function financialGroupLabel(item: SupplyItem) {
  if (item.financialGroup === 'equipment') return 'Equipamento';
  if (item.financialGroup === 'furniture') return 'Mobiliário';
  if (item.financialGroup === 'general') return 'Itens gerais';
  return item.groupName || item.category;
}

function totalQuantity(item: PlannedBudgetItem): string {
  const total = item.segment.stores.reduce(
    (sum, store) => sum + quantityToThousandths(store.quantity),
    0n,
  );
  return formatQuantityV2(String(Number(total) / 1000));
}

export function SupplyPlannedBudgetDetailPage() {
  const { budgetItemId } = useParams();
  const [budgetItem, setBudgetItem] = useState<PlannedBudgetItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!budgetItemId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listPlannedBudget();
      const item = data.items.find((entry) => entry.id === budgetItemId) || null;
      if (!item) throw new Error('not found');
      setBudgetItem(item);
    } catch {
      setError('Item do Orçamento Previsto não encontrado ou sem permissão de acesso.');
    } finally {
      setLoading(false);
    }
  }, [budgetItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeRows = useMemo(() => {
    if (!budgetItem) return [];
    const unitPriceCents = moneyToCents(budgetItem.unitPrice);
    return budgetItem.segment.stores.map((store) => ({
      ...store,
      totalCents:
        (unitPriceCents * quantityToThousandths(store.quantity) + 500n) / 1000n,
    }));
  }, [budgetItem]);

  if (loading) return <InlineLoading label="Carregando detalhe do orçamento" />;
  if (error || !budgetItem) {
    return <ErrorState message={error || 'Item não encontrado.'} onRetry={() => void load()} />;
  }

  const totalCents = plannedBudgetItemTotalCents(budgetItem);
  const active = budgetItem.active && budgetItem.segment.active;

  return (
    <section className="page-stack planned-budget-detail-page">
      <Link className="back-link" to="/suprimentos/orcamento-previsto">
        <ArrowLeft size={17} />
        Voltar para Orçamento Previsto
      </Link>

      <header className="page-heading planned-budget-detail-heading">
        <div>
          <span className="eyebrow">Suprimentos · Orçamento Previsto</span>
          <h2>{budgetItem.item.code} · {budgetItem.item.name}</h2>
          <p>Detalhamento do item, segmento e distribuição prevista por loja.</p>
        </div>
        <span className={`planned-budget-status planned-budget-status--${active ? 'active' : 'inactive'}`}>
          {active ? 'Ativo' : 'Inativo'}
        </span>
      </header>

      <section className="planned-budget-detail-kpis">
        <article>
          <Boxes size={20} />
          <span>Grupo</span>
          <strong>{financialGroupLabel(budgetItem.item)}</strong>
        </article>
        <article>
          <Layers3 size={20} />
          <span>Segmento</span>
          <strong>{budgetItem.segment.name}</strong>
        </article>
        <article>
          <StoreIcon size={20} />
          <span>Quantidade total</span>
          <strong>{totalQuantity(budgetItem)}</strong>
        </article>
        <article>
          <Calculator size={20} />
          <span>Valor total</span>
          <strong>{formatBRL(totalCents)}</strong>
        </article>
      </section>

      <section className="planned-budget-panel planned-budget-detail-relation">
        <header>
          <div>
            <Calculator size={19} />
            <div>
              <h3>Relação por item</h3>
              <p>Resumo do planejamento deste item no orçamento previsto.</p>
            </div>
          </div>
        </header>
        <div className="planned-budget-table-scroll">
          <table className="planned-budget-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Grupo</th>
                <th>Valor unitário</th>
                <th>Segmento</th>
                <th>Lojas</th>
                <th>Qtd. total</th>
                <th>Valor total</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{budgetItem.item.code}</strong>
                  <span>{budgetItem.item.name}</span>
                </td>
                <td><strong>{financialGroupLabel(budgetItem.item)}</strong></td>
                <td><strong>{formatBRL(moneyToCents(budgetItem.unitPrice))}</strong></td>
                <td>
                  <strong>{budgetItem.segment.name}</strong>
                  {budgetItem.segment.notes && <small>{budgetItem.segment.notes}</small>}
                </td>
                <td><strong>{budgetItem.segment.stores.length}</strong></td>
                <td><strong>{totalQuantity(budgetItem)}</strong></td>
                <td><strong>{formatBRL(totalCents)}</strong></td>
                <td>
                  <span className={`planned-budget-status planned-budget-status--${active ? 'active' : 'inactive'}`}>
                    {active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details className="planned-budget-linked-stores">
        <summary>
          <span>
            <StoreIcon size={18} />
            <strong>Ver lojas vinculadas</strong>
          </span>
          <small>{storeRows.length} loja(s)</small>
        </summary>
        <div className="planned-budget-table-scroll">
          <table className="planned-budget-table">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Cidade / UF</th>
                <th>Quantidade</th>
                <th>Valor unitário</th>
                <th>Total previsto</th>
              </tr>
            </thead>
            <tbody>
              {storeRows.map((store) => (
                <tr key={store.id}>
                  <td>
                    <strong>{store.storeCode}</strong>
                    <span>{store.storeName}</span>
                  </td>
                  <td>
                    <span className="planned-budget-store-location">
                      <MapPin size={14} />
                      {store.storeCity}/{store.storeState}
                    </span>
                  </td>
                  <td><strong>{formatQuantityV2(store.quantity)}</strong></td>
                  <td>{formatBRL(moneyToCents(budgetItem.unitPrice))}</td>
                  <td><strong>{formatBRL(store.totalCents)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
