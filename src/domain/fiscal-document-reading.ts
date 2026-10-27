import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FiscalItem, FiscalParty, FiscalReading } from './document-audit-types';

export const emptyParty = (): FiscalParty => ({
  name: null,
  taxId: null,
  city: null,
  state: null,
  address: null,
});
export function emptyReading(source: FiscalReading['source'], warning: string): FiscalReading {
  return {
    source,
    status: source === 'unavailable' ? 'failed' : 'unreadable',
    model: null,
    number: null,
    series: null,
    accessKey: null,
    issueDate: null,
    issuer: emptyParty(),
    recipient: emptyParty(),
    delivery: emptyParty(),
    items: [],
    totals: {},
    totalCents: null,
    warnings: [warning],
    evidence: '',
    reliable: false,
    cancelled: false,
  };
}

export function normalizedFiscalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fiscal decimals are parsed exactly; missing/ambiguous tokens never become zero. */
export function fiscalCents(value: unknown, locale: 'xml' | 'br' = 'xml'): bigint | null {
  if (typeof value !== 'string') return null;
  let token = value.trim();
  if (locale === 'br') {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token)) return null;
    token = token.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(token)) return null;
  const negative = token.startsWith('-');
  const [whole, fraction = ''] = token.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -amount : amount;
}

type XmlNode = Record<string, unknown>;
const node = (value: unknown): XmlNode =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as XmlNode) : {};
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const child = (value: unknown, key: string) => node(node(value)[key]);
const text = (value: unknown, key: string) => str(node(value)[key]);
function findNodes(value: unknown, key: string): XmlNode[] {
  if (Array.isArray(value)) return value.flatMap((entry) => findNodes(entry, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, entry]) =>
    name === key ? (Array.isArray(entry) ? entry.map(node) : [node(entry)]) : findNodes(entry, key),
  );
}

function party(value: unknown, addressKey: string): FiscalParty {
  const address = child(value, addressKey);
  return {
    name: text(value, 'xNome'),
    taxId: text(value, 'CNPJ') || text(value, 'CPF'),
    city: text(address, 'xMun'),
    state: text(address, 'UF'),
    address:
      ['xLgr', 'nro', 'xCpl', 'xBairro', 'xMun', 'UF', 'CEP']
        .map((key) => text(address, key))
        .filter(Boolean)
        .join(', ') || null,
  };
}

export function isValidNfeKey(value: string): boolean {
  if (!/^\d{44}$/.test(value)) return false;
  let sum = 0,
    weight = 2;
  for (let index = 42; index >= 0; index--) {
    sum += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const digit = 11 - (sum % 11);
  return Number(value[43]) === (digit >= 10 ? 0 : digit);
}

/** Supported NF-e/NFC-e schemas only. Other XML layouts remain explicitly incomplete. */
export function readFiscalXml(xml: string): FiscalReading {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    return emptyReading('xml', 'XML com DTD/entidades não é aceito para leitura.');
  if (XMLValidator.validate(xml) !== true)
    return emptyReading('xml', 'XML inválido; não foi possível confirmar os campos.');
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
  }).parse(xml);
  const invoices = findNodes(parsed, 'infNFe');
  if (invoices.length !== 1)
    return emptyReading(
      'xml',
      invoices.length > 1
        ? 'XML contém várias notas; separar os documentos para conferência individual.'
        : 'Modelo de XML não reconhecido como NF-e/NFC-e; revisão manual necessária.',
    );
  const info = invoices[0];
  const ide = child(info, 'ide');
  const totals = child(child(info, 'total'), 'ICMSTot');
  const details = info.det ? (Array.isArray(info.det) ? info.det : [info.det]) : [];
  const items: FiscalItem[] = details.map((entry, index) => {
    const detail = node(entry),
      product = child(detail, 'prod'),
      taxes = child(detail, 'imposto');
    return {
      id: text(detail, '@_nItem') || String(index + 1),
      code: text(product, 'cProd'),
      description: text(product, 'xProd') || 'Não informado',
      quantity: text(product, 'qCom'),
      unit: text(product, 'uCom'),
      unitPrice: text(product, 'vUnCom'),
      productCents: fiscalCents(product.vProd),
      freightCents: fiscalCents(product.vFrete),
      insuranceCents: fiscalCents(product.vSeg),
      discountCents: fiscalCents(product.vDesc),
      otherCents: fiscalCents(product.vOutro),
      ipiCents: fiscalCents(child(child(taxes, 'IPI'), 'IPITrib').vIPI),
      stCents: fiscalCents(
        findNodes(taxes.ICMS, 'ICMS10')[0]?.vICMSST ?? findTaxValue(taxes.ICMS, 'vICMSST'),
      ),
      includedInTotal:
        text(product, 'indTot') === '1' ? true : text(product, 'indTot') === '0' ? false : null,
      evidence: `XML det[nItem=${text(detail, '@_nItem') || index + 1}]/prod: ${JSON.stringify(product)}`,
    };
  });
  const accessKeyCandidate = text(info, '@_Id')?.replace(/^NFe/, '') || null;
  const accessKey =
    accessKeyCandidate && isValidNfeKey(accessKeyCandidate) ? accessKeyCandidate : null;
  const result: FiscalReading = {
    source: 'xml',
    status: 'incomplete',
    model: text(ide, 'mod'),
    number: text(ide, 'nNF'),
    series: text(ide, 'serie'),
    accessKey,
    issueDate: text(ide, 'dhEmi') || text(ide, 'dEmi'),
    issuer: party(info.emit, 'enderEmit'),
    recipient: party(info.dest, 'enderDest'),
    delivery: {
      ...emptyParty(),
      name: text(info.entrega, 'xNome'),
      taxId: text(info.entrega, 'CNPJ') || text(info.entrega, 'CPF'),
      city: text(info.entrega, 'xMun'),
      state: text(info.entrega, 'UF'),
      address:
        ['xLgr', 'nro', 'xCpl', 'xBairro', 'xMun', 'UF', 'CEP']
          .map((key) => text(info.entrega, key))
          .filter(Boolean)
          .join(', ') || null,
    },
    items,
    totals: Object.fromEntries(
      [
        'vProd',
        'vFrete',
        'vSeg',
        'vDesc',
        'vOutro',
        'vII',
        'vIPI',
        'vIPIDevol',
        'vST',
        'vFCPST',
        'vICMSDeson',
        'vICMS',
        'vPIS',
        'vCOFINS',
        'vTotTrib',
        'vNF',
      ].map((key) => [key, fiscalCents(totals[key])]),
    ),
    totalCents: fiscalCents(totals.vNF),
    warnings: [],
    evidence: xml,
    reliable: false,
    cancelled: findNodes(parsed, 'infProt').some((prot) =>
      ['101', '151'].includes(text(prot, 'cStat') || ''),
    ),
  };
  if (!accessKey)
    result.warnings.push('Chave de acesso ausente ou com dígito inválido; conferir documento.');
  if (!['55', '65'].includes(result.model || ''))
    result.warnings.push('Modelo fiscal não suportado para comparação automática.');
  if (!result.issuer.taxId || !result.recipient.taxId)
    result.warnings.push('Identificação do emitente/destinatário ausente no XML.');
  if (
    !items.length ||
    items.some(
      (item) =>
        item.quantity === null ||
        item.unitPrice === null ||
        item.productCents === null ||
        item.description === 'Não informado',
    )
  )
    result.warnings.push('Itens incompletos no XML.');
  if (result.totalCents === null) result.warnings.push('Total vNF ausente ou inválido no XML.');
  if (result.cancelled) result.warnings.push('XML informa cancelamento da nota.');
  result.reliable = result.warnings.length === 0;
  result.status = result.reliable ? 'complete' : 'incomplete';
  result.warnings.push('Leitura do arquivo anexado; situação fiscal não consultada na SEFAZ.');
  return result;
}

function findTaxValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const object = node(value);
  if (key in object) return object[key];
  return Object.values(object)
    .map((entry) => findTaxValue(entry, key))
    .find((entry) => entry !== undefined);
}

/** Unstructured/OCR fields remain provisional; never invent table cells from a similar filename. */
export function readFiscalText(content: string, source: 'pdf_text' | 'ocr'): FiscalReading {
  const result = emptyReading(
    source,
    source === 'ocr'
      ? 'Leitura por OCR: campos extraídos exigem revisão manual; não confirmam divergências automaticamente.'
      : 'Leitura de texto do PDF: layout fiscal não estruturado; campos ausentes e itens exigem revisão manual.',
  );
  result.evidence = content;
  if (!content.trim()) return result;
  result.status = 'incomplete';
  const normalized = normalizedFiscalText(content);
  const keyMatch = normalized.match(/CHAVE\s+(?:DE\s+)?ACESSO\s*[:|]?\s*((?:\d[\s.]*){44})/);
  const key = keyMatch?.[1].replace(/\D/g, '') || '';
  if (isValidNfeKey(key)) result.accessKey = key;
  const totalMatch = normalized.match(
    /(?:VALOR TOTAL DA NOTA(?: FISCAL)?|VALOR TOTAL DO DOCUMENTO|VALOR TOTAL DOS SERVICOS)\s*[:|]?\s*(?:R\$\s*)?(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})(?!\d)/,
  );
  result.totalCents = fiscalCents(totalMatch?.[1], 'br');
  const totalLabels =
    normalized.match(
      /VALOR TOTAL DA NOTA(?: FISCAL)?|VALOR TOTAL DO DOCUMENTO|VALOR TOTAL DOS SERVICOS/g,
    ) || [];
  if (totalLabels.length > 1) {
    result.totalCents = null;
    result.warnings.push(
      'Há múltiplos campos de total no arquivo; não foi escolhido um valor como total integral. Conferir páginas/documentos manualmente.',
    );
  }
  result.totals = { totalInformadoNoTexto: result.totalCents };
  const recipientId = normalized.match(
    /(?:CNPJ\s+(?:DO\s+)?DESTINATARIO|DESTINATARIO\s*[-:]\s*CNPJ)\s*[:|]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/,
  );
  result.recipient.taxId = recipientId?.[1].replace(/\D/g, '') || null;
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recipientStart = lines.findIndex((line) =>
    /DESTINATARIO\s*[/ -]?\s*REMETENTE/.test(normalizedFiscalText(line)),
  );
  if (recipientStart >= 0) {
    const section = lines.slice(recipientStart + 1);
    const end = section.findIndex((line) =>
      /^(?:FATURA|DUPLICATA|CALCULO DO IMPOSTO|TRANSPORTADOR|DADOS D[OA])/.test(
        normalizedFiscalText(line),
      ),
    );
    const recipientLines = end >= 0 ? section.slice(0, end) : section.slice(0, 15);
    const nameHeader = recipientLines.findIndex((line) =>
      /NOME\s*\/?\s*RAZAO SOCIAL/.test(normalizedFiscalText(line)),
    );
    if (nameHeader >= 0) {
      const next = recipientLines[nameHeader + 1] || '';
      const fields = next.match(
        /^(.{2,160}?)\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{14}|\d{11})(?:\s|$)/,
      );
      if (fields) {
        result.recipient.name = fields[1].trim();
        result.recipient.taxId = fields[2].replace(/\D/g, '');
      }
    }
  }
  const explicitName = content.match(
    /(?:NOME\s*\/?\s*RAZ[AÃ]O SOCIAL DO DESTINAT[AÁ]RIO|DESTINAT[AÁ]RIO)\s*:\s*([^\n|]{3,160})/i,
  );
  if (!result.recipient.name && explicitName) result.recipient.name = explicitName[1].trim();
  // Only recognize complete printed rows in the common DANFE NCM/CST/CFOP layout.
  // Never distribute a loose list of numbers across guessed columns.
  const printedRow =
    /^(\S{1,30})\s+(.{2,250}?)\s+(\d{8})\s+(\d{2,3})\s+(\d{4})\s+([A-Za-z]{1,6})\s+(-?[\d.]+,\d{1,6})\s+(-?[\d.]+,\d{2,10})\s+(-?[\d.]+,\d{2})(?:\s|$)/;
  lines.forEach((line, index) => {
    const fields = line.match(printedRow);
    if (!fields) return;
    result.items.push({
      id: `linha-${index + 1}`,
      code: fields[1],
      description: fields[2],
      quantity: fields[7].replace(/\./g, '').replace(',', '.'),
      unit: fields[6],
      unitPrice: fields[8].replace(/\./g, '').replace(',', '.'),
      productCents: fiscalCents(fields[9], 'br'),
      freightCents: null,
      insuranceCents: null,
      discountCents: null,
      otherCents: null,
      ipiCents: null,
      stCents: null,
      includedInTotal: null,
      evidence: `Linha de texto/OCR ${index + 1}: ${line}`,
    });
  });
  result.warnings.push(
    result.items.length
      ? `${result.items.length} linha(s) de itens reconhecida(s) no layout DANFE. Tabela e composição podem estar incompletas; revisão manual obrigatória.`
      : 'A composição e a tabela de itens não foram reconhecidas com segurança. Consulte o trecho original e o arquivo.',
  );
  return result;
}
