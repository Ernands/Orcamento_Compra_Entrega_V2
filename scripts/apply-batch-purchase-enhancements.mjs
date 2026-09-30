import fs from 'node:fs';

const path = 'src/pages/supply-purchases-page.tsx';
let source = fs.readFileSync(path, 'utf8');

function fail(label) {
  throw new Error(`Patch nao aplicado: ${label}`);
}

function replaceOnce(text, search, replacement, label) {
  if (typeof search === 'string') {
    const first = text.indexOf(search);
    if (first < 0) fail(label);
    if (text.indexOf(search, first + search.length) >= 0) fail(`${label} (mais de uma ocorrencia)`);
    return text.slice(0, first) + replacement + text.slice(first + search.length);
  }
  const matches = [...text.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))];
  if (matches.length !== 1) fail(`${label} (${matches.length} ocorrencias)`);
  return text.replace(search, replacement);
}

function patchSegment(full, startMarker, endMarker, patcher, label) {
  const start = full.indexOf(startMarker);
  const end = full.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) fail(label);
  const segment = full.slice(start, end);
  const patched = patcher(segment);
  return full.slice(0, start) + patched + full.slice(end);
}

if (!source.includes('type PurchaseAttachmentDraft =')) {
  source = replaceOnce(
    source,
    'function paymentDraft(purchase: PurchaseV2, key = \'payment-1\'): PurchasePaymentDraft {',
    `type PurchaseAttachmentDraft = {\n  key: string;\n  documentType: PurchaseDocumentType;\n  documentNumber: string;\n  description: string;\n  files: File[];\n};\n\nfunction purchaseAttachmentDraft(key = 'attachment-1'): PurchaseAttachmentDraft {\n  return { key, documentType: 'invoice', documentNumber: '', description: '', files: [] };\n}\n\nfunction paymentDraft(purchase: PurchaseV2, key = 'payment-1'): PurchasePaymentDraft {`,
    'tipo de rascunho de anexo',
  );
}

source = patchSegment(
  source,
  'function RegisterPurchaseModal({',
  '\ntype BulkPurchaseDraftLine = {',
  (segment) => {
    segment = replaceOnce(
      segment,
      /  const \[file, setFile\] = useState<File \| null>\(null\);\n  const \[documentType, setDocumentType\] = useState<PurchaseDocumentType>\('invoice'\);\n  const \[documentNumber, setDocumentNumber\] = useState\(''\);\n  const \[documentDescription, setDocumentDescription\] = useState\(''\);\n/,
      `  const [attachments, setAttachments] = useState<PurchaseAttachmentDraft[]>(() => [purchaseAttachmentDraft()]);\n  const nextAttachmentKey = useRef(2);\n`,
      'estado de anexos da compra individual',
    );

    const paymentAnchor = `  const updatePayment = (key: string, change: Partial<PurchasePaymentDraft>) => {\n    setPayments((current) => current.map((payment) => payment.key === key ? { ...payment, ...change } : payment));\n  };\n`;
    segment = replaceOnce(
      segment,
      paymentAnchor,
      `${paymentAnchor}\n  const updateAttachment = (key: string, change: Partial<PurchaseAttachmentDraft>) => {\n    setAttachments((current) => current.map((attachment) => attachment.key === key ? { ...attachment, ...change } : attachment));\n  };\n  const addAttachment = () => {\n    const key = \`attachment-\${nextAttachmentKey.current++}\`;\n    setAttachments((current) => [...current, purchaseAttachmentDraft(key)]);\n  };\n`,
      'helpers de anexos da compra individual',
    );

    segment = replaceOnce(
      segment,
      `      if (file) {\n        const validation = validatePurchaseAttachmentV2(file);\n        if (validation) throw new Error(validation);\n      }\n`,
      `      for (const attachment of attachments) {\n        for (const attachmentFile of attachment.files) {\n          const validation = validatePurchaseAttachmentV2(attachmentFile);\n          if (validation) throw new Error(validation);\n        }\n      }\n`,
      'validacao de anexos da compra individual',
    );

    segment = replaceOnce(
      segment,
      /      if \(file\) \{\n        try \{\n          const storeIds = hasMultipleDestinations[\s\S]*?        \} catch \(failure\) \{\n          setUploadWarning\(errorMessage\(failure, 'A compra e o pagamento foram salvos, mas o arquivo nao foi enviado\.'\)\);\n        \}\n      \}\n/,
      `      const attachmentsToUpload = attachments.flatMap((attachment) =>\n        attachment.files.map((attachmentFile, fileIndex) => ({ attachment, attachmentFile, fileIndex })),\n      );\n      if (attachmentsToUpload.length) {\n        try {\n          const storeIds = hasMultipleDestinations\n            ? [...new Set(multiLines.flatMap((line) => line.entry.stores\n                .filter((store) => {\n                  const value = destinationStoreAllocations[line.entry.id]?.[store.storeId] || '';\n                  try { return value.trim() && quantityToThousandths(value) > 0n; } catch { return false; }\n                })\n                .map((store) => store.storeId)))]\n            : eligibleStores\n                .filter((store) => {\n                  const value = storeAllocations[store.storeId] || '';\n                  try { return value.trim() && quantityToThousandths(value) > 0n; } catch { return false; }\n                })\n                .map((store) => store.storeId);\n\n          for (const { attachment, attachmentFile, fileIndex } of attachmentsToUpload) {\n            await uploadPurchaseAttachmentV3({\n              purchaseId: purchase.id,\n              purchaseOrderId: result.orderId,\n              file: attachmentFile,\n              description: attachment.description,\n              documentType: attachment.documentType,\n              documentNumber: attachment.documentNumber,\n              documentDate: purchasedOn,\n              documentAmount: fileIndex === 0 && total !== null ? centsToInput(total) : '',\n              storeIds,\n            });\n          }\n        } catch (failure) {\n          setUploadWarning(errorMessage(failure, 'A compra e o pagamento foram salvos, mas um ou mais arquivos nao foram enviados.'));\n        }\n      }\n`,
      'upload de anexos da compra individual',
    );

    segment = replaceOnce(
      segment,
      /      <section className="purchase-v2-operation-section">\n        <header><span>4<\/span><div><strong>Arquivo da compra<\/strong><small>Opcional\. Nota fiscal, recibo ou comprovante ficara na mesma operacao\.<\/small><\/div><\/header>[\s\S]*?      <\/section>\n      \{error &&/,
      `      <section className="purchase-v2-operation-section">\n        <header><span>4</span><div><strong>Arquivos da compra</strong><small>Opcional. Selecione varias notas de uma vez ou adicione grupos para recibos e comprovantes.</small></div></header>\n        <div className="purchase-v2-payment-drafts">\n          {attachments.map((attachment, index) => <div className="purchase-v2-payment-draft" key={attachment.key}>\n            <header><strong>Documento {index + 1}</strong>{attachments.length > 1 && <button type="button" className="button button--secondary button--small" onClick={() => setAttachments((current) => current.filter((entry) => entry.key !== attachment.key))}><XCircle size={15}/>Remover</button>}</header>\n            <div className="form-grid form-grid--three">\n              <label className="field">Tipo de documento<select value={attachment.documentType} onChange={(event) => updateAttachment(attachment.key, { documentType: event.target.value as PurchaseDocumentType })}>{OPERATIONAL_DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}</select></label>\n              <label className="field">Numero do documento<input value={attachment.documentNumber} onChange={(event) => updateAttachment(attachment.key, { documentNumber: event.target.value })} /></label>\n              <label className="field">Arquivos<input type="file" multiple onChange={(event) => updateAttachment(attachment.key, { files: Array.from(event.target.files || []) })} /><small>{attachment.files.length ? \`\${attachment.files.length} arquivo(s) selecionado(s)\` : 'Nenhum arquivo selecionado'}</small></label>\n            </div>\n            <label className="field">Descricao do arquivo<input value={attachment.description} onChange={(event) => updateAttachment(attachment.key, { description: event.target.value })} /></label>\n          </div>)}\n        </div>\n        <button type="button" className="button button--secondary button--small" onClick={addAttachment}><Plus size={15}/>Adicionar novos arquivos</button>\n      </section>\n      {error &&`,
      'editor de anexos da compra individual',
    );

    return segment;
  },
  'segmento da compra individual',
);

source = patchSegment(
  source,
  'function BulkRegisterPurchaseModal({',
  '\ntype PortfolioBulkPurchaseDraftLine = BulkPurchaseDraftLine & {',
  (segment) => {
    segment = replaceOnce(
      segment,
      /  const \[file, setFile\] = useState<File \| null>\(null\);\n  const \[documentType, setDocumentType\] = useState<PurchaseDocumentType>\('invoice'\);\n  const \[documentNumber, setDocumentNumber\] = useState\(''\);\n  const \[documentDescription, setDocumentDescription\] = useState\(''\);\n/,
      `  const [bulkShippingMode, setBulkShippingMode] = useState<'total' | 'individual'>('individual');\n  const [totalShipping, setTotalShipping] = useState('');\n  const [attachments, setAttachments] = useState<PurchaseAttachmentDraft[]>(() => [purchaseAttachmentDraft()]);\n  const nextAttachmentKey = useRef(2);\n`,
      'estado de frete e anexos da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `    setFile(null);\n    setDocumentType('invoice');\n    setDocumentNumber('');\n    setDocumentDescription('');\n`,
      `    setBulkShippingMode('individual');\n    setTotalShipping('');\n    setAttachments([purchaseAttachmentDraft()]);\n    nextAttachmentKey.current = 2;\n`,
      'reset de frete e anexos da compra em lote',
    );

    segment = replaceOnce(
      segment,
      /  const lineTotal = \(line: BulkPurchaseDraftLine\): bigint \| null => \{[\s\S]*?  const total = selectedLines.length && selectedLines.every\(\(line\) => lineTotal\(line\) !== null\)\n    \? selectedLines.reduce\(\(sum, line\) => sum \+ \(lineTotal\(line\) \|\| 0n\), 0n\)\n    : null;\n/,
      `  const lineSubtotal = (line: BulkPurchaseDraftLine): bigint | null => {\n    try {\n      if (!line.quantity.trim() || !line.unitPrice.trim()) return null;\n      return calculateRegistrationTotal({\n        quantity: line.quantity,\n        unitPrice: line.unitPrice,\n        discountAmount: '0',\n        shippingAmount: '0',\n        otherCosts: '0',\n      });\n    } catch {\n      return null;\n    }\n  };\n  const totalShippingCents = (() => {\n    try {\n      return totalShipping.trim() ? moneyToCents(totalShipping) : null;\n    } catch {\n      return null;\n    }\n  })();\n  const totalShippingAllocations = bulkShippingMode === 'total' && totalShippingCents !== null && selectedLines.length\n    ? allocateCentsByWeights(totalShippingCents, selectedLines.map((line) => lineSubtotal(line) || 0n))\n    : [];\n  const effectiveShipping = (line: BulkPurchaseDraftLine): bigint | null => {\n    try {\n      if (bulkShippingMode === 'individual') return line.shipping.trim() ? moneyToCents(line.shipping) : null;\n      const index = selectedLines.findIndex((entry) => entry.key === line.key);\n      return index >= 0 && totalShippingCents !== null ? totalShippingAllocations[index] || 0n : null;\n    } catch {\n      return null;\n    }\n  };\n  const lineTotal = (line: BulkPurchaseDraftLine): bigint | null => {\n    const subtotal = lineSubtotal(line);\n    const shippingCents = effectiveShipping(line);\n    return subtotal === null || shippingCents === null ? null : subtotal + shippingCents;\n  };\n  const total = selectedLines.length && selectedLines.every((line) => lineTotal(line) !== null)\n    ? selectedLines.reduce((sum, line) => sum + (lineTotal(line) || 0n), 0n)\n    : null;\n`,
      'calculo do frete total da compra em lote',
    );

    const paymentAnchor = `  const updatePayment = (key: string, change: Partial<PurchasePaymentDraft>) => {\n    setPayments((current) => current.map((payment) => payment.key === key ? { ...payment, ...change } : payment));\n  };\n`;
    segment = replaceOnce(
      segment,
      paymentAnchor,
      `${paymentAnchor}\n  const updateAttachment = (key: string, change: Partial<PurchaseAttachmentDraft>) => {\n    setAttachments((current) => current.map((attachment) => attachment.key === key ? { ...attachment, ...change } : attachment));\n  };\n  const addAttachment = () => {\n    const key = \`bulk-attachment-\${nextAttachmentKey.current++}\`;\n    setAttachments((current) => [...current, purchaseAttachmentDraft(key)]);\n  };\n`,
      'helpers de anexos da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `      const rpcLines = selectedLines.map((line) => {\n`,
      `      if (bulkShippingMode === 'total') {\n        if (!totalShipping.trim()) throw new Error('Informe o frete total da compra. Use 0 quando o frete for gratis.');\n        if (totalShippingCents === null || totalShippingCents < 0n) throw new Error('Revise o frete total da compra.');\n      }\n      const rpcLines = selectedLines.map((line) => {\n`,
      'validacao do frete total da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `        if (moneyToCents(line.unitPrice) < 0n || moneyToCents(line.shipping) < 0n) throw new Error('Valores negativos nao sao permitidos.');\n        if (lineTotal(line) === null) throw new Error(\`Informe preco e frete de \${line.item.itemName}. Use 0 quando o frete for gratis.\`);\n`,
      `        if (moneyToCents(line.unitPrice) < 0n) throw new Error('Valores negativos nao sao permitidos.');\n        if (bulkShippingMode === 'individual' && moneyToCents(line.shipping) < 0n) throw new Error('Valores negativos nao sao permitidos.');\n        if (lineTotal(line) === null) throw new Error(\`Informe preco e frete de \${line.item.itemName}. Use 0 quando o frete for gratis.\`);\n`,
      'validacao por linha da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `          shippingAmount: line.shipping,\n`,
      `          shippingAmount: centsToInput(effectiveShipping(line) || 0n),\n`,
      'frete rateado salvo nas linhas da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `      if (file) {\n        const validation = validatePurchaseAttachmentV2(file);\n        if (validation) throw new Error(validation);\n      }\n`,
      `      for (const attachment of attachments) {\n        for (const attachmentFile of attachment.files) {\n          const validation = validatePurchaseAttachmentV2(attachmentFile);\n          if (validation) throw new Error(validation);\n        }\n      }\n`,
      'validacao de anexos da compra em lote',
    );

    segment = replaceOnce(
      segment,
      /      if \(file\) \{\n        const storeIds = \[\.\.\.new Set\(rpcLines[\s\S]*?      \}\n      await onSaved\(\);/,
      `      const attachmentsToUpload = attachments.flatMap((attachment) =>\n        attachment.files.map((attachmentFile, fileIndex) => ({ attachment, attachmentFile, fileIndex })),\n      );\n      if (attachmentsToUpload.length) {\n        const storeIds = [...new Set(rpcLines.flatMap((line) => (line.storeAllocations || []).map((allocation) => allocation.storeId)))];\n        try {\n          for (const { attachment, attachmentFile, fileIndex } of attachmentsToUpload) {\n            await uploadPurchaseAttachmentV3({\n              purchaseId: purchase.id,\n              purchaseOrderId: result.orderId,\n              file: attachmentFile,\n              description: attachment.description,\n              documentType: attachment.documentType,\n              documentNumber: attachment.documentNumber,\n              documentDate: purchasedOn,\n              documentAmount: fileIndex === 0 && total !== null ? centsToInput(total) : '',\n              storeIds,\n            });\n          }\n        } catch {\n          setError('A compra foi salva, mas um ou mais arquivos nao foram enviados. Voce pode anexar os documentos depois.');\n          await onSaved();\n          return;\n        }\n      }\n      await onSaved();`,
      'upload multiplo da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `<label className="field">Frete<input value={line.shipping} disabled={!line.selected} onChange={(event) => updateLine(line.key, { shipping: event.target.value })} placeholder="0 para gratis"/></label>`,
      `<label className="field">Frete{bulkShippingMode === 'total'\n            ? <input value={line.selected && effectiveShipping(line) !== null ? centsToInput(effectiveShipping(line) || 0n) : ''} disabled placeholder="Rateado do frete total"/>\n            : <input value={line.shipping} disabled={!line.selected} onChange={(event) => updateLine(line.key, { shipping: event.target.value })} placeholder="0 para gratis"/>}</label>`,
      'campo de frete por linha da compra em lote',
    );

    segment = replaceOnce(
      segment,
      `      <header><span>3</span><div><strong>Pagamento</strong><small>Use o parcelamento para separar entrada paga das parcelas futuras.</small></div></header>\n      <div className="purchase-v2-installment-builder">`,
      `      <header><span>3</span><div><strong>Pagamento</strong><small>Use o parcelamento para separar entrada paga das parcelas futuras.</small></div></header>\n      <div className="purchase-v2-shipping-mode">\n        <strong>Frete da compra em lote</strong>\n        <div className="segmented">\n          <button type="button" className={bulkShippingMode === 'individual' ? 'is-active' : ''} onClick={() => setBulkShippingMode('individual')}>Frete por item</button>\n          <button type="button" className={bulkShippingMode === 'total' ? 'is-active' : ''} onClick={() => setBulkShippingMode('total')}>Frete total da compra</button>\n        </div>\n        {bulkShippingMode === 'total' && <label className="field">Frete total realizado<input value={totalShipping} onChange={(event) => setTotalShipping(event.target.value)} placeholder="Informe o total · 0 = gratis" /></label>}\n        {bulkShippingMode === 'total' && selectedLines.length > 1 && <small className="purchase-v2-muted">O frete total sera rateado proporcionalmente entre os itens selecionados e ja entrara no total do pagamento.</small>}\n      </div>\n      <div className="purchase-v2-installment-builder">`,
      'opcao de frete total junto ao pagamento',
    );

    segment = replaceOnce(
      segment,
      /    <section className="purchase-v2-operation-section">\n      <header><span>4<\/span><div><strong>Arquivo geral da compra<\/strong><small>Opcional; fica vinculado ao pedido completo e as lojas dos itens selecionados\.<\/small><\/div><\/header>[\s\S]*?    <\/section>\n\n    \{error &&/,
      `    <section className="purchase-v2-operation-section">\n      <header><span>4</span><div><strong>Arquivos da compra</strong><small>Selecione varias notas de uma vez e use + Adicionar novos arquivos para recibos, comprovantes ou outros tipos.</small></div></header>\n      <div className="purchase-v2-payment-drafts">\n        {attachments.map((attachment, index) => <div className="purchase-v2-payment-draft" key={attachment.key}>\n          <header><strong>Documento {index + 1}</strong>{attachments.length > 1 && <button type="button" className="button button--secondary button--small" onClick={() => setAttachments((current) => current.filter((entry) => entry.key !== attachment.key))}><XCircle size={15}/>Remover</button>}</header>\n          <div className="form-grid form-grid--three">\n            <label className="field">Tipo de documento<select value={attachment.documentType} onChange={(event) => updateAttachment(attachment.key, { documentType: event.target.value as PurchaseDocumentType })}>{OPERATIONAL_DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}</select></label>\n            <label className="field">Numero do documento<input value={attachment.documentNumber} onChange={(event) => updateAttachment(attachment.key, { documentNumber: event.target.value })} /></label>\n            <label className="field">Arquivos<input type="file" multiple onChange={(event) => updateAttachment(attachment.key, { files: Array.from(event.target.files || []) })} /><small>{attachment.files.length ? \`\${attachment.files.length} arquivo(s) selecionado(s)\` : 'Nenhum arquivo selecionado'}</small></label>\n          </div>\n          <label className="field">Descricao<input value={attachment.description} onChange={(event) => updateAttachment(attachment.key, { description: event.target.value })} /></label>\n        </div>)}\n      </div>\n      <button type="button" className="button button--secondary button--small" onClick={addAttachment}><Plus size={15}/>Adicionar novos arquivos</button>\n    </section>\n\n    {error &&`,
      'editor multiplo de arquivos da compra em lote',
    );

    return segment;
  },
  'segmento da compra em lote',
);

fs.writeFileSync(path, source);
console.log('Patch aplicado em', path);
