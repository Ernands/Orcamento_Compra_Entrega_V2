import { FileClock, FileText, Search, ShieldCheck } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import {
  lookupReferenceAudit,
  type ReferenceAudit,
  type ReferenceAuditEvent,
} from '../data/admin/reference-audit-repository';
import './admin-reference-audit-page.css';

const typeLabels: Record<string, string> = {
  quote: 'Orçamento', invoice: 'Nota fiscal', receipt: 'Recibo',
  payment_proof: 'Comprovante de pagamento', reimbursement: 'Documento de reembolso',
  boleto: 'Boleto', rpa: 'RPA', other: 'Outro',
};

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, timeZone: 'America/Fortaleza',
});

function displayDate(value: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : dateTime.format(date);
}

function eventLabel(event: ReferenceAuditEvent): string {
  if (event.action === 'works.insert' || event.action === 'purchase.attachment.created') {
    return 'Arquivo anexado';
  }
  if (event.action === 'works.delete' || event.action === 'purchase.attachment.deleted') {
    return 'Arquivo excluído';
  }
  if (event.fileChanged && event.previousName) return 'Arquivo substituído';
  if (event.previousType !== event.nextType) return 'Classificação alterada';
  if (event.previousStatus !== event.nextStatus) return 'Conferência atualizada';
  if (event.previousPaymentId !== event.nextPaymentId) return 'Vínculo de pagamento alterado';
  if (event.action === 'purchase.payment.proof.linked') return 'Comprovante vinculado';
  return 'Dados do anexo atualizados';
}

function displayKind(type: string): string {
  return typeLabels[type] || type;
}

export function AdminReferenceAuditPage() {
  const [code, setCode] = useState('');
  const [record, setRecord] = useState<ReferenceAudit | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (!/^(OBR|CMP)-\d{5,}$/.test(value)) {
      setError('Informe um código válido, como OBR-00320 ou CMP-00038.');
      setRecord(null);
      setSearched(false);
      return;
    }
    setCode(value);
    setError(null);
    setSearched(false);
    setRecord(null);
    setLoading(true);
    const version = ++requestVersion.current;
    try {
      const result = await lookupReferenceAudit(value);
      if (requestVersion.current !== version) return;
      setRecord(result);
      setSearched(true);
    } catch (cause) {
      if (requestVersion.current !== version) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a auditoria.');
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  };

  return (
    <div className="page-stack admin-reference-audit">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Administração</span>
          <h2>Auditoria de OBR e CMP</h2>
          <p>Consulte a criação dos lançamentos e o histórico de seus arquivos, sem modificar registros.</p>
        </div>
      </header>

      <form className="admin-audit-search" onSubmit={(event) => void search(event)}>
        <label htmlFor="admin-audit-code">Código da OBR ou CMP</label>
        <div>
          <input id="admin-audit-code" value={code} onChange={(event) => setCode(event.target.value)}
            autoComplete="off" placeholder="Ex.: OBR-00320 ou CMP-00038" maxLength={24} />
          <button className="button button--primary" type="submit" disabled={loading}>
            <Search size={17} />{loading ? 'Consultando...' : 'Consultar'}
          </button>
        </div>
        <small>Horários de Brasília (UTC−3). Consulta restrita à Administração.</small>
      </form>

      {error && <p role="alert" className="admin-audit-message admin-audit-error">{error}</p>}
      {!loading && searched && !record && (
        <p className="admin-audit-message">Nenhum lançamento localizado para esse código.</p>
      )}
      {record && (
        <>
          <section className="admin-audit-panel" aria-labelledby="admin-audit-record-title">
            <div className="admin-audit-panel-heading">
              <ShieldCheck size={19} />
              <h3 id="admin-audit-record-title">Dados de criação · {record.code}</h3>
            </div>
            <div className="admin-audit-facts">
              <div><span>Referência</span><strong>{record.code}</strong></div>
              <div><span>Tipo</span><strong>{record.kind === 'OBR' ? 'Obras e Serviços' : 'Compra'}</strong></div>
              <div><span>Quem criou</span><strong>{record.createdBy}</strong></div>
              <div><span>Data e hora da criação</span><strong>{displayDate(record.createdAt)}</strong></div>
              <div><span>Localidade registrada</span><strong>{record.location || 'Não informada'}</strong></div>
              <div><span>Situação</span><strong>{record.status}</strong></div>
            </div>
            <p className="admin-audit-source">
              Origem da identificação: {record.creatorBasis}.
              {record.kind === 'CMP' ? ' A CMP é gerada a partir da aprovação da cotação.' : ''}
            </p>
          </section>

          <section className="admin-audit-panel" aria-labelledby="admin-audit-files-title">
            <div className="admin-audit-panel-heading">
              <FileText size={19} />
              <h3 id="admin-audit-files-title">Arquivos cadastrados ({record.files.length})</h3>
            </div>
            {record.files.length === 0 ? (
              <p className="admin-audit-empty">Nenhum arquivo atualmente cadastrado. Consulte o histórico abaixo para verificar exclusões anteriores.</p>
            ) : (
              <div className="admin-audit-table-scroll">
                <table className="admin-audit-table">
                  <thead>
                    <tr><th>Arquivo</th><th>Tipo</th><th>Enviado por</th><th>Data e hora do envio</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {record.files.map((file) => (
                      <tr key={file.id}>
                        <td className="admin-audit-filename">{file.name || 'Sem nome'}</td>
                        <td>{displayKind(file.type)}</td><td>{file.uploadedBy}</td>
                        <td>{displayDate(file.uploadedAt)}</td>
                        <td>{file.deleted ? 'Excluído' : 'Cadastrado'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-audit-panel" aria-labelledby="admin-audit-events-title">
            <div className="admin-audit-panel-heading">
              <FileClock size={19} />
              <h3 id="admin-audit-events-title">Histórico de anexos ({record.events.length} eventos)</h3>
            </div>
            {record.events.length === 0 ? (
              <p className="admin-audit-empty">Não há eventos históricos de anexos registrados.</p>
            ) : (
              <div className="admin-audit-table-scroll">
                <table className="admin-audit-table">
                  <thead>
                    <tr><th>Data e hora</th><th>Operação</th><th>Arquivo</th><th>Usuário</th></tr>
                  </thead>
                  <tbody>
                    {record.events.map((entry) => (
                      <tr key={entry.id}>
                        <td>{displayDate(entry.at)}</td>
                        <td>{eventLabel(entry)}</td>
                        <td className="admin-audit-filename">{entry.name}
                          {entry.previousName && entry.nextName && entry.previousName !== entry.nextName && (
                            <small>Anterior: {entry.previousName}</small>
                          )}
                        </td>
                        <td>{entry.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
