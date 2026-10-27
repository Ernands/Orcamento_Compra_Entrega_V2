import type { CellValue, Worksheet } from 'exceljs';
import type { Store } from '../../domain/types';
import type {
  AuditDocument,
  AuditFile,
  AuditFinding,
  AuditRecord,
  FiscalRecipient,
} from '../../domain/document-audit-types';
import { auditSummary, buildAuditFindings } from '../../domain/document-audit';
import { emptyReading } from '../../domain/fiscal-document-reading';
import { createFiscalReader, type FiscalReader } from '../../lib/fiscal-document-reader';
import { planReimbursementZipFileNames } from './finance-reimbursement-export';

const money = (value: bigint | null): number | string =>
  value === null
    ? 'Não verificável'
    : value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)
      ? `${value / 100n}.${String(value < 0n ? -(value % 100n) : value % 100n).padStart(2, '0')}`
      : Number(value) / 100;
const value = (text: string | null) => text ?? 'Não informado';
const safe = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .slice(0, 80);
const unique = <T>(items: T[]) => [...new Set(items)];
const MONEY = 'R$ #,##0.00;[Red]-R$ #,##0.00';
function centsLabel(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')}`;
}

export function auditFileNames(documents: AuditDocument[]): Map<string, string> {
  const plan = planReimbursementZipFileNames({
    documents,
    lines: documents.flatMap((doc) =>
      doc.links.map((link) => ({
        documents: [doc],
        row: { supplierName: link.supplier, referenceCodes: [link.reference] },
      })),
    ),
  });
  return new Map(documents.map((doc) => [doc.key, plan.get(`${doc.source}:${doc.id}`)!]));
}

function row(sheet: Worksheet, values: CellValue[], monetaryColumns: number[] = []) {
  const added = sheet.addRow(values);
  added.alignment = { vertical: 'top', wrapText: true };
  added.eachCell((cell) => {
    cell.font = { size: 10, color: { argb: 'FF26354A' } };
  });
  monetaryColumns.forEach((column) => {
    added.getCell(column).numFmt = MONEY;
  });
  if (added.number % 2 === 0)
    added.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } };
    });
  return added;
}

export async function createAuditWorkbook(input: {
  store: Store;
  records: AuditRecord[];
  files: AuditFile[];
  findings: AuditFinding[];
  recipients: FiscalRecipient[];
  generatedAt: Date;
}): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Implanta 27';
  workbook.created = input.generatedAt;
  const summary = auditSummary(input.records, input.files, input.store.id);
  const fileByKey = new Map(input.files.map((file) => [file.document.key, file]));
  const createSheet = (name: string, headers: string[], widths: number[]) => {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
    });
    sheet.columns = widths.map((width) => ({ width }));
    sheet.mergeCells(1, 1, 1, Math.min(headers.length, 7));
    sheet.getCell('A1').value = `Conferência de Compras e Obras · ${name}`;
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF173F78' } };
    sheet.getRow(1).height = 30;
    sheet.mergeCells(2, 1, 2, Math.min(headers.length, 7));
    sheet.getCell('A2').value =
      `${input.store.code} · ${input.store.city}/${input.store.state} · ${input.store.name}`;
    sheet.mergeCells(3, 1, 3, Math.min(headers.length, 7));
    sheet.getCell('A3').value =
      `Gerado em ${input.generatedAt.toISOString()} · Diferenças = documento menos sistema · Valores em BRL`;
    sheet.mergeCells(4, 1, 4, Math.min(headers.length, 7));
    sheet.getCell('A4').value =
      'Dados originais preservados. Não informado / Não verificável não significam zero. Extraia todo o ZIP antes de abrir os links.';
    sheet.getCell('A4').alignment = { wrapText: true };
    sheet.getRow(4).height = 30;
    sheet.mergeCells(5, 1, 5, Math.min(headers.length, 7));
    sheet.getCell('A5').value =
      `Destinatários aceitos: ${unique(input.recipients.map((recipient) => recipient.name)).join(' ou ')}. CNPJ/CPF somente quando cadastrado.`;
    const header = sheet.getRow(7);
    header.values = headers;
    header.height = 36;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F78' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });
    sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: headers.length } };
    return sheet;
  };

  const system = createSheet(
    'Itens do sistema',
    [
      'Loja',
      'Cidade/UF',
      'Referência',
      'Tipo da linha',
      'Fornecedor/prestador',
      'Pedido / ID do item',
      'Situação',
      'Inclui total ativo?',
      'Código',
      'Item/serviço',
      'Quantidade integral',
      'Quantidade da loja',
      'Unidade',
      'Preço unitário cadastrado',
      'Subtotal de produtos (calculado)',
      'Frete registrado',
      'Desconto registrado',
      'Outros valores registrados',
      'Total do item/componente',
      'Valor do item atribuído à loja',
      'Total integral da referência',
      'Total da referência atribuído à loja',
      'Valor aprovado/orçado',
      'Lojas do item (IDs)',
      'Documentos vinculados',
    ],
    [
      18, 23, 20, 21, 31, 39, 30, 16, 17, 55, 18, 18, 13, 22, 23, 20, 20, 23, 22, 26, 24, 27, 22,
      40, 65,
    ],
  );
  const systemMoneyColumns = [15, 16, 17, 18, 19, 20, 21, 22, 23];
  input.records.forEach((record) => {
    const documents = record.documents
      .map((doc) => fileByKey.get(doc.key)?.path || `Indisponível: ${doc.name}`)
      .join('\n');
    record.items.forEach((item) =>
      row(
        system,
        [
          input.store.code,
          `${input.store.city}/${input.store.state}`,
          record.reference,
          record.source === 'work'
            ? 'Componente de obra'
            : item.orderId
              ? 'Item de compra'
              : 'Item aprovado',
          value(record.supplier || null),
          item.orderId ? `${item.orderId} / ${item.id}` : item.id,
          item.stage,
          item.included ? 'Sim' : 'Não',
          value(item.code),
          item.description,
          value(item.quantity),
          value(item.storeQuantity),
          value(item.unit),
          value(item.unitPrice),
          money(item.subtotalCents),
          money(item.freightCents),
          money(item.discountCents),
          money(item.otherCents),
          money(item.totalCents),
          money(item.storeCents),
          null,
          null,
          null,
          item.storeIds.join('; ') || 'Rateio não informado',
          documents,
        ],
        systemMoneyColumns,
      ),
    );
    const totalRow = row(
      system,
      [
        input.store.code,
        `${input.store.city}/${input.store.state}`,
        record.reference,
        'TOTAL DA REFERÊNCIA',
        value(record.supplier || null),
        null,
        record.active ? 'Registro ativo' : 'Cancelado/devolvido — excluído dos totais',
        record.active ? 'Sim' : 'Não',
        null,
        record.description,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        money(record.totalCents),
        money(record.storeCents),
        money(record.budgetCents),
        record.storeIds.join('; '),
        documents,
      ],
      systemMoneyColumns,
    );
    totalRow.font = { bold: true };
  });
  row(
    system,
    [
      input.store.code,
      `${input.store.city}/${input.store.state}`,
      'TOTAL DA SELEÇÃO',
      'Somar somente totais das referências ativas',
      null,
      null,
      summary.unknownRecords
        ? `${summary.unknownRecords} referência(s) com valor da loja desconhecido`
        : 'Totais conhecidos',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      money(summary.systemCents),
    ],
    systemMoneyColumns,
  );

  const fiscal = createSheet(
    'Notas fiscais',
    [
      'Tipo da linha',
      'Arquivo no ZIP',
      'Arquivo original',
      'Referências conhecidas',
      'Tipo cadastrado',
      'Origem da leitura',
      'Resultado da leitura',
      'Falha / limitação',
      'SHA-256',
      'Mesmo arquivo que',
      'Modelo',
      'Número',
      'Série',
      'Chave de acesso',
      'Emissão',
      'Emitente',
      'CNPJ/CPF emitente',
      'Destinatário',
      'CNPJ/CPF destinatário',
      'Município/UF destinatário',
      'Endereço destinatário',
      'Município/UF entrega',
      'Endereço entrega',
      'Item / código',
      'Descrição',
      'Quantidade',
      'Unidade',
      'Valor unitário (decimal original)',
      'Produtos/serviços',
      'Frete',
      'Seguro',
      'Desconto',
      'Outras despesas',
      'IPI',
      'ST',
      'Total da nota (uma vez por arquivo)',
      'Valor digitado no cadastro do anexo',
      'Composição dos totalizadores (somente leitura)',
      'Evidência / caminho no XML',
    ],
    [
      23, 62, 44, 28, 17, 19, 21, 65, 65, 62, 13, 16, 13, 49, 26, 38, 23, 38, 23, 29, 60, 28, 60,
      20, 58, 18, 13, 24, 20, 19, 19, 19, 21, 19, 19, 27, 25, 90, 90,
    ],
  );
  input.files.forEach((file) => {
    const { document: doc, reading } = file;
    const path: CellValue = file.path
      ? { text: file.path, hyperlink: file.path, tooltip: 'Abra após extrair todo o ZIP.' }
      : `Indisponível: ${doc.name}`;
    const references = unique(doc.links.map((link) => link.reference)).join(' + ');
    const composition = Object.entries(reading.totals)
      .map(([key, amount]) => `${key}: ${amount === null ? 'Não informado' : centsLabel(amount)}`)
      .join('; ');
    row(
      fiscal,
      [
        'Documento',
        path,
        doc.name,
        references,
        doc.type === 'invoice' ? 'Nota fiscal' : 'Recibo',
        reading.source,
        reading.status,
        [file.error, ...reading.warnings].filter(Boolean).join('; '),
        value(file.hash),
        file.duplicateOf || '',
        value(reading.model),
        value(reading.number),
        value(reading.series),
        value(reading.accessKey),
        value(reading.issueDate),
        value(reading.issuer.name),
        value(reading.issuer.taxId),
        value(reading.recipient.name),
        value(reading.recipient.taxId),
        [reading.recipient.city, reading.recipient.state].filter(Boolean).join('/') ||
          'Não informado',
        value(reading.recipient.address),
        [reading.delivery.city, reading.delivery.state].filter(Boolean).join('/') ||
          'Não informado',
        value(reading.delivery.address),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        file.duplicateOf ? null : money(reading.totalCents),
        value(doc.registeredAmount),
        composition,
        reading.evidence.slice(0, 30000),
      ],
      [36],
    );
    reading.items.forEach((item) =>
      row(
        fiscal,
        [
          'Item',
          file.path,
          doc.name,
          references,
          doc.type === 'invoice' ? 'Nota fiscal' : 'Recibo',
          reading.source,
          reading.status,
          item.includedInTotal === false ? 'indTot=0: item não integra o total de produtos' : '',
          null,
          null,
          null,
          null,
          null,
          reading.accessKey,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          `${item.id} / ${item.code || 'Não informado'}`,
          item.description,
          value(item.quantity),
          value(item.unit),
          value(item.unitPrice),
          money(item.productCents),
          money(item.freightCents),
          money(item.insuranceCents),
          money(item.discountCents),
          money(item.otherCents),
          money(item.ipiCents),
          money(item.stCents),
          null,
          null,
          null,
          item.evidence.slice(0, 30000),
        ],
        [29, 30, 31, 32, 33, 34, 35],
      ),
    );
  });
  row(
    fiscal,
    [
      'RESUMO',
      null,
      null,
      'Notas únicas — sem multiplicar pelos itens',
      null,
      null,
      `${summary.uniqueInvoiceCount} nota(s) única(s)`,
      `${summary.unreadableInvoices} nota(s) sem total legível; ${summary.failedFiles} falha(s) de download. Valores de recibos não somados às notas.`,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      money(summary.readableInvoiceCents),
    ],
    [36],
  );

  const comparison = createSheet(
    'Conferência e divergências',
    [
      'Loja',
      'Cidade/UF',
      'Referência(s)',
      'Verificação',
      'Resultado',
      'Item no sistema',
      'Item no documento',
      'Documento(s)',
      'Quantidade sistema',
      'Quantidade documento',
      'Valor sistema',
      'Valor documento',
      'Diferença (documento − sistema)',
      'Explicação',
      'Evidência',
    ],
    [18, 24, 27, 35, 25, 49, 49, 64, 21, 22, 22, 22, 25, 95, 95],
  );
  const summaries: Array<[string, bigint | null, string]> = [
    [
      'Total atribuído à loja no sistema',
      summary.systemCents,
      `${summary.unknownRecords} referência(s) com total desconhecido. Cancelados/devolvidos excluídos.`,
    ],
    [
      'Subtotal conhecido no sistema',
      summary.systemKnownCents,
      'Subtotal informativo; não substitui um total com referências desconhecidas.',
    ],
    [
      'Totais legíveis das notas únicas',
      summary.readableInvoiceCents,
      'Valor integral dos documentos; pode abranger outras lojas/referências. Não é automaticamente reembolsável nem atribuível à loja.',
    ],
    [
      'Notas com vínculo exclusivo à loja e seleção',
      summary.attributableInvoiceCents,
      `${summary.unattributedInvoices} nota(s) não atribuída(s) automaticamente. Ausências/limitações constam abaixo.`,
    ],
  ];
  summaries.forEach(([label, amount, explanation]) =>
    row(
      comparison,
      [
        input.store.code,
        `${input.store.city}/${input.store.state}`,
        'RESUMO GERAL',
        label,
        'Informativo',
        null,
        null,
        null,
        null,
        null,
        money(amount),
        null,
        null,
        explanation,
      ],
      [11],
    ),
  );
  input.findings.forEach((finding) => {
    const added = row(
      comparison,
      [
        input.store.code,
        `${input.store.city}/${input.store.state}`,
        finding.references.join(' + '),
        finding.category,
        finding.status,
        finding.systemItem,
        finding.fiscalItem,
        unique(
          finding.fileKeys.map(
            (key) => fileByKey.get(key)?.path || fileByKey.get(key)?.document.name || key,
          ),
        ).join('\n'),
        finding.systemQuantity,
        finding.fiscalQuantity,
        money(finding.systemCents),
        money(finding.fiscalCents),
        money(finding.differenceCents),
        finding.explanation,
        finding.evidence.slice(0, 30000),
      ],
      [11, 12, 13],
    );
    added.getCell(5).font = {
      bold: true,
      color: {
        argb:
          finding.status === 'Divergência' || finding.status === 'Sem nota ou recibo'
            ? 'FFB42318'
            : finding.status === 'Conferido'
              ? 'FF176148'
              : 'FF8A6100',
      },
    };
  });
  return workbook.xlsx.writeBuffer();
}

export async function generateAuditPackage(input: {
  store: Store;
  records: AuditRecord[];
  recipients: FiscalRecipient[];
  ocr: boolean;
  getSignedUrl: (document: AuditDocument) => Promise<string>;
  signal?: AbortSignal;
  progress?: (message: string) => void;
  reader?: FiscalReader;
  fetchDocument?: (document: AuditDocument) => Promise<ArrayBuffer>;
}) {
  if (!input.records.length) throw new Error('Selecione ao menos uma compra ou obra.');
  const checkAbort = () => {
    if (input.signal?.aborted) throw new Error('Geração cancelada.');
  };
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const documents = [
    ...new Map(
      input.records.flatMap((record) => record.documents).map((doc) => [doc.key, doc]),
    ).values(),
  ];
  const names = auditFileNames(documents);
  const hashes = new Map<string, AuditFile>();
  const files: AuditFile[] = [];
  const reader =
    input.reader ||
    createFiscalReader({ ocr: input.ocr, signal: input.signal, progress: input.progress });
  try {
    for (let index = 0; index < documents.length; index++) {
      checkAbort();
      const doc = documents[index];
      input.progress?.(`Documento ${index + 1}/${documents.length}: ${doc.name}`);
      const file: AuditFile = {
        document: doc,
        path: null,
        hash: null,
        duplicateOf: null,
        error: null,
        reading: emptyReading('unavailable', 'Anexo ainda não obtido.'),
      };
      files.push(file);
      let bytes: ArrayBuffer;
      try {
        if (!doc.storagePath.trim()) throw new Error('Cadastro do anexo não contém arquivo.');
        if (input.fetchDocument) bytes = await input.fetchDocument(doc);
        else {
          const url = await input.getSignedUrl(doc);
          const response = await fetch(url, { signal: input.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bytes = await response.arrayBuffer();
        }
        checkAbort();
        if (!bytes.byteLength) throw new Error('Arquivo vazio.');
        file.hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((part) => part.toString(16).padStart(2, '0'))
          .join('');
        const existing = hashes.get(file.hash);
        if (existing) {
          file.path = existing.path;
          file.duplicateOf = existing.document.key;
          file.reading = existing.reading;
          continue;
        }
        file.path = names.get(doc.key)!;
        zip.file(file.path, new Uint8Array(bytes));
        hashes.set(file.hash, file);
      } catch (error) {
        checkAbort();
        // Never export a signed URL, token, or raw fetch error containing credentials.
        const message =
          error instanceof Error &&
          /^HTTP \d{3}$|^Arquivo vazio\.$|^Cadastro do anexo não contém arquivo\.$/.test(
            error.message,
          )
            ? error.message
            : 'Não foi possível obter o arquivo com o acesso atual. Verifique o anexo e tente novamente.';
        file.error = message;
        file.reading = emptyReading('unavailable', message);
        continue;
      }
      try {
        file.reading = await reader.read(bytes, doc);
      } catch {
        checkAbort();
        file.reading = emptyReading(
          'unsupported',
          'Falha na leitura automática. Arquivo original incluído no ZIP; revisão manual necessária.',
        );
      }
      if (file.reading.evidence)
        zip.file(
          `Leituras/${safe(doc.source + '_' + doc.id)}.txt`,
          `EXTRAÇÃO AUTOMÁTICA — NÃO SUBSTITUI O DOCUMENTO ORIGINAL\n${file.reading.source}\n${file.reading.warnings.join('\n')}\n\n${file.reading.evidence}`,
        );
    }
  } finally {
    await reader.dispose();
  }
  checkAbort();
  input.progress?.('Correlacionando itens e preparando a planilha…');
  const findings = buildAuditFindings({ ...input, files });
  const summary = auditSummary(input.records, files, input.store.id);
  const generatedAt = new Date();
  zip.file(
    `Conferencia_${safe(input.store.code + '_' + input.store.city)}.xlsx`,
    await createAuditWorkbook({ ...input, files, findings, generatedAt }),
  );
  zip.file(
    'Leia-me.txt',
    [
      'Conferência de Compras e Obras — Implanta 27',
      `Loja: ${input.store.code} · ${input.store.city}/${input.store.state}`,
      `Referências: ${input.records.map((record) => record.reference).join('; ')}`,
      `Destinatários aceitos: ${unique(input.recipients.map((recipient) => recipient.name)).join(' ou ')}`,
      `Falhas de download: ${summary.failedFiles}. Consulte as três abas do Excel para pendências e limites de leitura.`,
      'Extraia todo o ZIP antes de abrir os links. Originais preservados. Leitura automática não comprova autenticidade fiscal.',
      'Notas compartilhadas contam uma vez no total documental, sem atribuição integral automática à loja.',
      'PDFs/imagens usam texto/OCR e exigem revisão manual. XML NF-e/NFC-e suportado permite comparação estruturada.',
      'Processamento local no navegador, sem envio dos documentos a serviços externos de OCR.',
    ].join('\n'),
  );
  checkAbort();
  input.progress?.('Compactando arquivos…');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    () => checkAbort(),
  );
  return {
    blob,
    files,
    findings,
    summary,
    filename: `Conferencia_${safe(input.store.code + '_' + input.store.city)}_${generatedAt.toISOString().slice(0, 10)}.zip`,
  };
}
