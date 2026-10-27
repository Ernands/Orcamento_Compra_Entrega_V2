import type { AuditDocument, AuditFile, AuditRecord } from '../../domain/document-audit-types';
import type { Store } from '../../domain/types';
import { readFiscalXml } from '../../domain/fiscal-document-reading';

export const auditStore = {
  id: 'store-a',
  code: 'LOJ-TESTE',
  name: 'Loja de teste',
  city: 'Ubajara',
  state: 'CE',
} as Store;
export const testKey = (() => {
  const base = '3526100000000000000055001000000001100000000';
  let sum = 0,
    weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const digit = 11 - (sum % 11);
  return base + (digit >= 10 ? 0 : digit);
})();
export function auditXml(name = 'Thiago Lima Perdigao', total = '112.50') {
  return `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${testKey}" versao="4.00"><ide><mod>55</mod><nNF>1</nNF><serie>1</serie><dhEmi>2026-10-27T09:00:00-03:00</dhEmi></ide><emit><xNome>FORNECEDOR DE TESTE</xNome><CNPJ>00000000000000</CNPJ><enderEmit><xMun>São Paulo</xMun><UF>SP</UF></enderEmit></emit><dest><xNome>${name}</xNome><CPF>00000000000</CPF><enderDest><xMun>Ubajara</xMun><UF>CE</UF></enderDest></dest><det nItem="1"><prod><cProd>FISCAL-1</cProd><xProd>Item de teste</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>100.0000000000</vUnCom><vProd>100.00</vProd><vFrete>15.00</vFrete><vDesc>2.50</vDesc><vOutro>0.00</vOutro><indTot>1</indTot></prod><imposto><ICMS><ICMS00><vICMS>18.00</vICMS></ICMS00></ICMS></imposto></det><total><ICMSTot><vProd>100.00</vProd><vFrete>15.00</vFrete><vDesc>2.50</vDesc><vNF>${total}</vNF><vICMS>18.00</vICMS></ICMSTot></total></infNFe></NFe></nfeProc>`;
}
export function auditDoc(id = 'doc-1', recordId = 'purchase:p1'): AuditDocument {
  return {
    id,
    key: `purchase:${id}`,
    source: 'purchase',
    type: 'invoice',
    name: 'nota.xml',
    number: null,
    storagePath: `${id}.xml`,
    needsStoreReview: false,
    mimeType: 'application/xml',
    registeredAmount: null,
    links: [
      {
        recordId,
        reference: recordId === 'purchase:p1' ? 'CMP-TESTE1' : 'CMP-TESTE2',
        supplier: 'Fornecedor',
        storeIds: ['store-a'],
        explicitStores: true,
        orderId: null,
      },
    ],
  };
}
export function auditRecord(id = 'purchase:p1', doc = auditDoc()): AuditRecord {
  return {
    id,
    reference: id === 'purchase:p1' ? 'CMP-TESTE1' : 'CMP-TESTE2',
    source: 'purchase',
    supplier: 'Fornecedor',
    description: 'Item de teste',
    status: 'purchased',
    active: true,
    storeIds: ['store-a'],
    totalCents: 11250n,
    storeCents: 11250n,
    budgetCents: 11250n,
    documents: [doc],
    items: [
      {
        id: 'item1',
        recordId: id,
        orderId: 'order1',
        code: 'INTERNO-1',
        description: 'Item de teste',
        quantity: '1',
        storeQuantity: '1',
        unit: 'UN',
        unitPrice: '100.00',
        subtotalCents: 10000n,
        freightCents: 1500n,
        discountCents: 250n,
        otherCents: 0n,
        totalCents: 11250n,
        storeCents: 11250n,
        storeIds: ['store-a'],
        included: true,
        stage: 'Compra registrada',
      },
    ],
  };
}
export function auditFile(doc = auditDoc(), reading = readFiscalXml(auditXml())): AuditFile {
  return {
    document: doc,
    path: 'Notas_e_Recibos/Nota_Fornecedor_CMP-TESTE1.xml',
    hash: 'test-hash',
    duplicateOf: null,
    error: null,
    reading,
  };
}
