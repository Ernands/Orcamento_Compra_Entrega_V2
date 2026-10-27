import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileArchive, FileSearch, RefreshCcw, Search } from 'lucide-react';
import { useSession } from '../app/session-provider';
import { EmptyState, ErrorState, InlineLoading, StatusBadge } from '../components/ui';
import { listAuditStores } from '../data/finance/document-audit-repository';
import {
  createPurchaseAttachmentSignedUrlV2,
  listSupplyPurchasesV2,
} from '../data/purchases/purchases-v2-repository';
import { createWorkDocumentSignedUrl, listWorkServices } from '../data/works/works-repository';
import { buildAuditRecords } from '../domain/document-audit-records';
import { configuredAuditRecipients } from '../domain/document-audit-recipients';
import { formatBRL } from '../domain/supply-calculations';
import type { PurchaseV2 } from '../domain/purchase-v2-types';
import type { WorkService } from '../domain/works-types';
import type { Store } from '../domain/types';
import type { AuditFinding } from '../domain/document-audit-types';
import './finance-document-audit-page.css';

export function FinanceDocumentAuditPage() {
  const { can } = useSession();
  const allowed = can('finance.view') && can('finance.document_audit_view');
  const [stores, setStores] = useState<Store[]>([]);
  const [purchases, setPurchases] = useState<PurchaseV2[]>([]);
  const [works, setWorks] = useState<WorkService[]>([]);
  const [storeId, setStoreId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState(true);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{
    findings: AuditFinding[];
    failed: number;
    references: string[];
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setResult(null);
    try {
      const [nextStores, nextPurchases, nextWorks] = await Promise.all([
        listAuditStores(),
        listSupplyPurchasesV2({ allRows: true }),
        listWorkServices({ allRows: true }),
      ]);
      if (current !== generation.current) return;
      setStores(nextStores);
      setPurchases(nextPurchases);
      setWorks(nextWorks);
      setStoreId((previous) => (nextStores.some((store) => store.id === previous) ? previous : ''));
    } catch {
      if (current === generation.current)
        setError(
          'Não foi possível carregar todos os registros. Recarregue antes de gerar a conferência.',
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    const counter = generation;
    void load();
    return () => {
      counter.current++;
      controller.current?.abort();
    };
  }, [load]);
  const store = stores.find((entry) => entry.id === storeId);
  const records = useMemo(
    () => (storeId ? buildAuditRecords(storeId, purchases, works) : []),
    [storeId, purchases, works],
  );
  const filtered = useMemo(
    () =>
      records.filter((record) =>
        `${record.reference} ${record.supplier} ${record.description}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(
            query
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase(),
          ),
      ),
    [records, query],
  );
  const chosen = records.filter((record) => selected.has(record.id));
  const selectedKnown = chosen
    .filter((record) => record.active)
    .reduce((sum, record) => sum + (record.storeCents ?? 0n), 0n);
  const selectedUnknown = chosen.filter(
    (record) => record.active && record.storeCents === null,
  ).length;
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const generate = async () => {
    if (!allowed || !store || !chosen.length || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress('Preparando documentos…');
    try {
      const recipients = configuredAuditRecipients(import.meta.env.VITE_FISCAL_RECIPIENTS_JSON);
      const { generateAuditPackage } = await import('../data/exports/document-audit-export');
      const report = await generateAuditPackage({
        store,
        records: chosen,
        recipients,
        ocr,
        signal: abort.signal,
        progress: setProgress,
        getSignedUrl: (doc) =>
          doc.source === 'purchase'
            ? createPurchaseAttachmentSignedUrlV2(doc.storagePath)
            : createWorkDocumentSignedUrl(doc.storagePath),
      });
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(report.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = report.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setResult({
        findings: report.findings,
        failed: report.summary.failedFiles,
        references: chosen.map((record) => record.reference),
      });
    } catch (cause) {
      setError(
        abort.signal.aborted
          ? 'Geração cancelada. Você pode tentar novamente.'
          : cause instanceof Error && cause.message.startsWith('Cadastro fiscal inválido')
            ? cause.message
            : 'Não foi possível gerar a conferência. Os registros originais foram preservados; tente novamente.',
      );
    } finally {
      setBusy(false);
      setProgress('');
      controller.current = null;
    }
  };
  if (!allowed)
    return (
      <EmptyState
        title="Acesso à conferência não permitido"
        detail="Solicite a permissão Conferência de Compras e Obras em Acessos."
      />
    );
  return (
    <div className="page document-audit-page">
      <header className="document-audit-heading">
        <div>
          <span className="document-audit-eyebrow">FINANCEIRO · CONFERÊNCIA DOCUMENTAL</span>
          <h1>
            <FileSearch size={26} aria-hidden="true" /> Conferência de Compras e Obras
          </h1>
          <p>Compare os lançamentos da loja com suas notas e recibos em um único arquivo.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          <RefreshCcw size={16} /> Atualizar
        </button>
      </header>
      <section className="document-audit-toolbar" aria-label="Seleção da loja">
        <label>
          Loja
          <select
            aria-label="Loja"
            value={storeId}
            disabled={loading || busy}
            onChange={(event) => {
              setStoreId(event.target.value);
              setSelected(new Set());
              setQuery('');
              setResult(null);
              setError(null);
            }}
          >
            <option value="">Selecione uma loja</option>
            {stores.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.code} · {entry.city}/{entry.state} · {entry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="document-audit-recipient">
          <strong>Destinatários aceitos</strong>
          <span>TERCEIRIZAÇÕES ou Thiago Lima Perdigao</span>
          <small>CNPJ/CPF conferido quando houver cadastro disponível.</small>
        </div>
      </section>
      {error && <ErrorState message={error} onRetry={!busy ? () => void load() : undefined} />}
      {loading ? (
        <InlineLoading label="Carregando compras, obras e vínculos documentais…" />
      ) : !store ? (
        <EmptyState
          title="Selecione uma loja para começar"
          detail="Todas as compras e obras vinculadas serão listadas, independentemente do pagamento."
        />
      ) : (
        <>
          <section className="document-audit-summary" aria-label="Resumo da seleção">
            <div>
              <span>Registros da loja</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Selecionados</span>
              <strong>{chosen.length}</strong>
            </div>
            <div>
              <span>Valor conhecido atribuído à loja</span>
              <strong>{formatBRL(selectedKnown)}</strong>
              <small>
                {selectedUnknown
                  ? `${selectedUnknown} registro(s) com valor/rateio não confirmado`
                  : 'Somente referências ativas selecionadas'}
              </small>
            </div>
          </section>
          <section className="document-audit-selection">
            <div className="document-audit-list-tools">
              <label className="document-audit-search">
                <Search size={17} />
                <input
                  aria-label="Buscar referência, fornecedor ou item"
                  placeholder="Buscar referência, fornecedor ou item"
                  value={query}
                  disabled={busy}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button
                className="button button--secondary button--small"
                disabled={busy || !filtered.length}
                onClick={() =>
                  setSelected(
                    (previous) => new Set([...previous, ...filtered.map((record) => record.id)]),
                  )
                }
              >
                {query ? 'Selecionar resultados' : 'Selecionar todos'}
              </button>
              <button
                className="button button--secondary button--small"
                disabled={busy || !selected.size}
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </button>
            </div>
            {!filtered.length ? (
              <EmptyState
                title="Nenhum registro encontrado"
                detail="Verifique a loja ou os termos da busca."
              />
            ) : (
              <div className="document-audit-table-wrap">
                <table className="document-audit-table">
                  <thead>
                    <tr>
                      <th>Selecionar</th>
                      <th>Referência / fornecedor</th>
                      <th>Compra ou serviço</th>
                      <th>Total integral</th>
                      <th>Valor da loja</th>
                      <th>Documentação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((record) => (
                      <tr key={record.id} className={selected.has(record.id) ? 'is-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${record.reference}`}
                            checked={selected.has(record.id)}
                            disabled={busy}
                            onChange={() => toggle(record.id)}
                          />
                        </td>
                        <td>
                          <strong>{record.reference}</strong>
                          <span>{record.supplier || 'Fornecedor não informado'}</span>
                          <StatusBadge status={record.status} />
                        </td>
                        <td>
                          <span>{record.description || 'Descrição não informada'}</span>
                          <small>
                            {record.source === 'purchase' ? 'Compra' : 'Obra / serviço'}
                            {record.storeIds.length > 1 ? ' · Compartilhada entre lojas' : ''}
                          </small>
                        </td>
                        <td>
                          {record.totalCents === null
                            ? 'Não confirmado'
                            : formatBRL(record.totalCents)}
                        </td>
                        <td>
                          <strong>
                            {record.storeCents === null
                              ? 'Não confirmado'
                              : formatBRL(record.storeCents)}
                          </strong>
                        </td>
                        <td>
                          <span>
                            {!record.documents.length
                              ? 'Sem nota ou recibo'
                              : record.documents.every((doc) => doc.type === 'receipt')
                                ? 'Documentado por recibo'
                                : `${record.documents.filter((doc) => doc.type === 'invoice').length} nota(s)`}
                          </span>
                          {!!record.documents.length && (
                            <small>
                              {record.documents.some((doc) => !doc.storagePath)
                                ? 'Há cadastro sem arquivo'
                                : 'Conteúdo será conferido ao gerar'}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="document-audit-export">
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={ocr}
                  disabled={busy}
                  onChange={(event) => setOcr(event.target.checked)}
                />{' '}
                Ler imagens e páginas digitalizadas por OCR
              </label>
              <p>
                O OCR pode demorar. Leituras incompletas e correspondências incertas ficam
                sinalizadas para revisão no Excel.
              </p>
            </div>
            <button
              className="button button--primary"
              disabled={busy || !chosen.length || loading}
              onClick={() => void generate()}
            >
              <FileArchive size={18} /> Gerar conferência — ZIP + Excel
            </button>
          </section>
          {busy && (
            <div className="document-audit-progress">
              <InlineLoading label={progress} />
              <button
                className="button button--secondary button--small"
                onClick={() => controller.current?.abort()}
              >
                Cancelar geração
              </button>
            </div>
          )}
          {result && (
            <section className="document-audit-result" role="status">
              <strong>
                {result.failed
                  ? `Arquivo gerado com ${result.failed} falha(s) de download`
                  : 'Arquivo de conferência gerado'}
              </strong>
              <p>{result.references.join(' · ')}</p>
              <p>
                {result.findings.filter((finding) => finding.status === 'Divergência').length}{' '}
                divergência(s) comprovada(s) e{' '}
                {
                  result.findings.filter((finding) =>
                    ['Revisão manual', 'Não verificável', 'Sem nota ou recibo'].includes(
                      finding.status,
                    ),
                  ).length
                }{' '}
                apontamento(s) para revisão. Consulte os detalhes nas três abas do Excel.
              </p>
              <small>
                A exportação não altera compras, obras, pagamentos ou documentos cadastrados.
              </small>
            </section>
          )}
        </>
      )}
    </div>
  );
}
