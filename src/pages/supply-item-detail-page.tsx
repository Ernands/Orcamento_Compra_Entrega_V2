import { ArrowLeft, Edit3, ExternalLink, FileText, MapPin, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { SupplyItemFormModal } from '../components/supply-item-form-modal';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { getSupplyItemDetail } from '../data/supplies/supplies-repository';
import type { SupplyItemDetail } from '../domain/types';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function SupplyItemDetailPage() {
  const { itemId } = useParams();
  const { can } = useSession();
  const [detail, setDetail] = useState<SupplyItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await getSupplyItemDetail(itemId));
    } catch {
      setError('Item nao encontrado ou sem permissao de acesso.');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <InlineLoading label="Carregando item" />;
  if (error || !detail)
    return <ErrorState message={error || 'Item nao encontrado.'} onRetry={() => void load()} />;

  const { item, needs, quoteUsages } = detail;

  return (
    <section className="page-stack">
      <Link className="back-link" to="/suprimentos/itens">
        <ArrowLeft size={17} />
        Voltar para itens
      </Link>

      <header className="item-detail-heading">
        <div>
          <p className="eyebrow">{item.code}</p>
          <h2>{item.name}</h2>
          <span>{item.description || 'Sem descricao cadastrada.'}</span>
        </div>
        <div className="page-heading__actions">
          <StatusBadge status={item.active ? 'active' : 'inactive'} />
          {can('items.manage') && (
            <button
              className="button button--secondary button--small"
              onClick={() => setEditing(true)}
            >
              <Edit3 size={16} />
              Editar
            </button>
          )}
        </div>
      </header>

      <section className="item-detail-grid" aria-label="Dados do item">
        <div>
          <span>Categoria</span>
          <strong>{item.category}</strong>
        </div>
        <div>
          <span>Grupo</span>
          <strong>{item.groupName || 'Nao informado'}</strong>
        </div>
        <div>
          <span>Area</span>
          <strong>{item.areaName || 'Nao informada'}</strong>
        </div>
        <div>
          <span>Subcategoria</span>
          <strong>{item.subcategory || 'Nao informada'}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong>{item.type === 'product' ? 'Produto' : 'Servico'}</strong>
        </div>
        <div>
          <span>Unidade</span>
          <strong>{item.defaultUnit}</strong>
        </div>
        <div>
          <span>Quantidade padrao</span>
          <strong>{item.defaultQuantity ?? 'Nao informada'}</strong>
        </div>
        <div>
          <span>Marca / referencia</span>
          <strong>{item.brandReference || 'Nao informada'}</strong>
        </div>
        <div>
          <span>Criado em</span>
          <strong>{formatDate(item.createdAt)}</strong>
        </div>
        <div>
          <span>Atualizado em</span>
          <strong>{formatDate(item.updatedAt)}</strong>
        </div>
      </section>

      {(item.technicalSpecification || item.productLink) && (
        <section className="detail-band">
          <header>
            <h3>Informacoes tecnicas</h3>
          </header>
          {item.technicalSpecification && <p>{item.technicalSpecification}</p>}
          {item.productLink && (
            <a href={item.productLink} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Abrir link do produto
            </a>
          )}
        </section>
      )}

      <section className="detail-band">
        <header>
          <div>
            <h3>Necessidades vinculadas</h3>
            <p>Demandas das lojas que utilizam este item.</p>
          </div>
          <strong>{needs.length}</strong>
        </header>
        {needs.length ? (
          <div className="usage-list">
            {needs.map((need) => (
              <article key={need.id}>
                <FileText size={18} />
                <div>
                  <strong>{need.title}</strong>
                  <span>
                    {need.storeCode} - {need.storeName}
                  </span>
                </div>
                <span>
                  <MapPin size={14} />
                  {need.storeCity} / {need.storeState}
                </span>
                <strong>
                  {need.quantity} {need.unit || item.defaultUnit}
                </strong>
                <StatusBadge status={need.status} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem necessidades vinculadas"
            detail="O item ainda nao foi demandado por uma loja acessivel."
          />
        )}
      </section>

      <section className="detail-band">
        <header>
          <div>
            <h3>Uso em cotacoes</h3>
            <p>Historico de linhas de cotacao deste item.</p>
          </div>
          <strong>{quoteUsages.length}</strong>
        </header>
        {quoteUsages.length ? (
          <div className="usage-list">
            {quoteUsages.map((usage) => (
              <article key={usage.id}>
                <ReceiptText size={18} />
                <div>
                  <strong>{usage.quoteCode}</strong>
                  <span>{usage.supplierName}</span>
                </div>
                <span>{formatDate(usage.quoteDate)}</span>
                <strong>
                  {usage.quantity} {usage.unit} · {formatMoney(usage.unitPrice)}
                </strong>
                <StatusBadge status={usage.status} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem cotacoes" detail="Nenhuma cotacao acessivel utiliza este item." />
        )}
      </section>

      <SupplyItemFormModal
        open={editing}
        item={item}
        onClose={() => setEditing(false)}
        onSaved={async () => load()}
      />
    </section>
  );
}
