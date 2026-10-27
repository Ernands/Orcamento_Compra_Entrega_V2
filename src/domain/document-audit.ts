import type { Store } from './types';
import type { AuditFile, AuditFinding, AuditRecord, FiscalRecipient } from './document-audit-types';
import { normalizedFiscalText } from './fiscal-document-reading';
import { nullableSum } from './document-audit-records';

const digits = (value: string) => value.replace(/\D/g, '');
const identityName = (value: string) => normalizedFiscalText(value).replace(/[^A-Z0-9]/g, '');
const decimal = (value: string | null) =>
  value === null ? null : value.replace(',', '.').replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
const union = <T>(values: T[]) => [...new Set(values)];

export function fiscalIdentity(file: AuditFile): string {
  const read = file.reading;
  // Low confidence text/OCR keys are provisional and must not collapse monetary totals.
  if (read.reliable && read.accessKey) return `nfe:${read.accessKey}`;
  return file.hash ? `sha256:${file.hash}` : file.document.key;
}

export function buildAuditFindings(input: {
  records: AuditRecord[];
  files: AuditFile[];
  store: Store;
  recipients: FiscalRecipient[];
}): AuditFinding[] {
  const { records, files, store, recipients } = input;
  const byId = new Map(records.map((record) => [record.id, record]));
  const findings: AuditFinding[] = [];
  const add = (
    ids: string[],
    category: string,
    status: AuditFinding['status'],
    explanation: string,
    extra: Partial<AuditFinding> = {},
  ) =>
    findings.push({
      recordIds: ids,
      references: ids.map((id) => byId.get(id)?.reference || id),
      category,
      status,
      explanation,
      systemItem: null,
      fiscalItem: null,
      fileKeys: [],
      systemQuantity: null,
      fiscalQuantity: null,
      systemCents: null,
      fiscalCents: null,
      differenceCents: null,
      evidence: '',
      ...extra,
    });

  records.forEach((record) => {
    if (!record.active)
      add(
        [record.id],
        'Escopo',
        'Revisão manual',
        'Registro cancelado/devolvido: documentos preservados, valores excluídos dos totais ativos.',
      );
    if (!record.documents.length)
      add(
        [record.id],
        'Documentação',
        'Sem nota ou recibo',
        'Nenhum anexo classificado como nota fiscal ou recibo está vinculado ao registro.',
      );
    else if (record.documents.every((doc) => doc.type === 'receipt'))
      add(
        [record.id],
        'Documentação',
        'Documentado por recibo',
        'Há recibo vinculado. Recibo é apresentado separadamente e não equivale a nota fiscal nem comprova, sozinho, a quitação.',
      );
    if (record.active && (record.storeCents === null || record.totalCents === null))
      add(
        [record.id],
        'Valores do sistema',
        'Não verificável',
        'Total de compra ou rateio não está confirmado no sistema. Valores aprovados e frete pendente não foram usados como valor efetivamente comprado.',
      );
    if (record.source === 'work' && record.active) {
      const componentSum = nullableSum(record.items.map((item) => item.totalCents));
      if (componentSum !== null && record.totalCents !== null && componentSum !== record.totalCents)
        add(
          [record.id],
          'Composição da obra',
          'Divergência',
          'A soma dos componentes cadastrados difere do valor contratado. Nenhum dos valores foi alterado.',
          {
            systemCents: record.totalCents,
            fiscalCents: componentSum,
            differenceCents: componentSum - record.totalCents,
            evidence: 'Componentes e valor contratado do sistema; não é uma comparação com nota.',
          },
        );
    }
  });

  for (const file of files) {
    const doc = file.document,
      reading = file.reading;
    const ids = union(doc.links.map((link) => link.recordId).filter((id) => byId.has(id)));
    const extra = { fileKeys: [doc.key] };
    if (file.error)
      add(
        ids,
        'Download',
        'Não verificável',
        `Anexo existente não incluído no ZIP: ${file.error}`,
        extra,
      );
    if (file.duplicateOf)
      add(
        ids,
        'Duplicidade de arquivo',
        'Revisão manual',
        'Conteúdo idêntico (SHA-256) a outro anexo. O arquivo foi incluído uma única vez e os vínculos foram preservados.',
        { ...extra, evidence: `SHA-256 ${file.hash}; mesmo arquivo que ${file.duplicateOf}` },
      );
    if (reading.status !== 'complete')
      add(ids, 'Leitura documental', 'Não verificável', reading.warnings.join(' '), extra);
    if (reading.cancelled)
      add(
        ids,
        'Situação fiscal',
        'Divergência',
        'O XML anexado informa cancelamento; a validade fiscal não foi consultada externamente.',
        extra,
      );
    const official = recipients.filter(
      (recipient) => !recipient.storeId || recipient.storeId === store.id,
    );
    const byName = reading.recipient.name
      ? official.find(
          (recipient) => identityName(recipient.name) === identityName(reading.recipient.name!),
        )
      : undefined;
    const configuredNumbers = official.filter((recipient) => recipient.taxId);
    const byNumber = reading.recipient.taxId
      ? configuredNumbers.find(
          (recipient) => digits(recipient.taxId!) === digits(reading.recipient.taxId!),
        )
      : undefined;
    const nameNumber =
      byName &&
      configuredNumbers.find(
        (recipient) => identityName(recipient.name) === identityName(byName.name),
      );
    if (!official.length)
      add(
        ids,
        'Destinatário aceito',
        'Não verificável',
        'Destinatários aceitos não configurados.',
        extra,
      );
    else if (
      byName &&
      nameNumber &&
      reading.recipient.taxId &&
      digits(nameNumber.taxId!) !== digits(reading.recipient.taxId)
    )
      add(
        ids,
        'Destinatário aceito',
        reading.reliable ? 'Divergência' : 'Revisão manual',
        'O nome corresponde a um destinatário aceito, mas o CNPJ/CPF difere do número cadastrado para esse nome.',
        {
          ...extra,
          evidence: `Documento: ${reading.recipient.taxId}; cadastro: ${nameNumber.taxId}`,
        },
      );
    else if (byName)
      add(
        ids,
        'Nome / razão social do destinatário',
        reading.reliable ? 'Conferido' : 'Revisão manual',
        'Nome/razão social corresponde a um dos destinatários aceitos pelo solicitante. Esta verificação pelo nome não confirma o CNPJ/CPF.',
        { ...extra, evidence: `Documento: ${reading.recipient.name}; nome aceito: ${byName.name}` },
      );
    else if (byNumber)
      add(
        ids,
        'Destinatário aceito',
        'Revisão manual',
        'CNPJ/CPF corresponde ao cadastro; razão social ausente ou com grafia diferente. Conferir denominação/abreviação.',
        {
          ...extra,
          evidence: `Documento: ${reading.recipient.name || 'Não informado'} · ${reading.recipient.taxId}; cadastro: ${byNumber.name}`,
        },
      );
    else if (!reading.recipient.name)
      add(
        ids,
        'Nome / razão social do destinatário',
        'Não verificável',
        'Nome/razão social do destinatário não identificado com segurança.',
        extra,
      );
    else {
      const alias = official.some((recipient) =>
        normalizedFiscalText(reading.recipient.name!).includes(
          normalizedFiscalText(recipient.name),
        ),
      );
      add(
        ids,
        'Nome / razão social do destinatário',
        reading.reliable && !alias ? 'Divergência' : 'Revisão manual',
        alias
          ? 'Razão social contém um dos nomes aceitos, mas não corresponde à denominação completa. Confirmar nome completo no cadastro, sem presumir equivalência.'
          : 'Nome/razão social extraído difere dos destinatários aceitos: TERCEIRIZAÇÕES ou Thiago Lima Perdigao.',
        { ...extra, evidence: `Destinatário: ${reading.recipient.name}` },
      );
    }
    add(
      ids,
      'CNPJ/CPF do destinatário',
      byNumber && reading.reliable ? 'Conferido' : 'Não verificável',
      byNumber
        ? 'CNPJ/CPF corresponde a um cadastro configurado.'
        : !configuredNumbers.length
          ? 'Nenhum CNPJ/CPF oficial foi configurado; o número não foi inferido a partir do nome nem validado pela própria nota.'
          : 'CNPJ/CPF ausente ou sem correspondência confirmada no cadastro.',
      {
        ...extra,
        evidence: `CNPJ/CPF no documento: ${reading.recipient.taxId || 'Não informado'}`,
      },
    );
    const hasDelivery = Boolean(reading.delivery.city || reading.delivery.state);
    const destination = hasDelivery ? reading.delivery : reading.recipient;
    const linkedStores = union(doc.links.flatMap((link) => link.storeIds));
    const exclusive = linkedStores.length === 1 && linkedStores[0] === store.id;
    if (!destination.city || !destination.state)
      add(
        ids,
        'Cidade / destino',
        'Não verificável',
        'Município/UF de destino não identificado por completo. O município do fornecedor não foi usado nesta validação.',
        extra,
      );
    else {
      const matches =
        normalizedFiscalText(destination.city) === normalizedFiscalText(store.city) &&
        normalizedFiscalText(destination.state) === normalizedFiscalText(store.state);
      add(
        ids,
        'Cidade / destino',
        matches && reading.reliable && exclusive
          ? 'Conferido'
          : !matches && hasDelivery && reading.reliable && exclusive
            ? 'Divergência'
            : 'Revisão manual',
        `${hasDelivery ? 'Local de entrega' : 'Município do destinatário'} ${matches ? 'corresponde à' : 'difere da'} loja selecionada.${!hasDelivery && !matches ? ' Sem local de entrega explícito, o endereço de faturamento não comprova entrega em loja errada.' : ''}${!exclusive ? ' Documento com escopo compartilhado/outra loja; conferir vínculo antes de atribuir valores.' : ''}`,
        {
          ...extra,
          evidence: `Documento: ${destination.city}/${destination.state}; loja: ${store.city}/${store.state}`,
        },
      );
    }
    if (doc.links.some((link) => !byId.has(link.recordId)))
      add(
        ids,
        'Documento compartilhado',
        'Revisão manual',
        'Documento também vinculado a referências fora da seleção; seu valor integral não foi atribuído à seleção.',
        {
          ...extra,
          evidence: doc.links
            .filter((link) => !byId.has(link.recordId))
            .map((link) => link.reference)
            .join('; '),
        },
      );
    const possibleExternal = (doc.possibleLinks || []).filter((link) => !byId.has(link.recordId));
    if (possibleExternal.length)
      add(
        ids,
        'Possível documento fora da seleção',
        'Revisão manual',
        'Mesmo número cadastrado e fornecedor aparecem em outras referências. Isso não comprova identidade fiscal; a comparação integral ficou inconclusiva até revisão.',
        { ...extra, evidence: possibleExternal.map((link) => link.reference).join('; ') },
      );
    if (doc.registeredAmount !== null && reading.totalCents !== null) {
      // Registered metadata is shown separately from fiscal evidence; never use it to fill missing fiscal fields.
      const token = doc.registeredAmount.replace(',', '.');
      if (/^\d+(?:\.\d{1,2})?$/.test(token)) {
        const [whole, fraction = ''] = token.split('.');
        const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        if (amount !== reading.totalCents)
          add(
            ids,
            'Valor cadastrado do anexo',
            reading.reliable ? 'Divergência' : 'Revisão manual',
            'O valor digitado no cadastro do anexo difere do total lido no documento.',
            {
              ...extra,
              systemCents: amount,
              fiscalCents: reading.totalCents,
              differenceCents: reading.totalCents - amount,
            },
          );
      }
    }
  }

  const identities = new Map<string, AuditFile[]>();
  files
    .filter((file) => !file.error)
    .forEach((file) => {
      const key = fiscalIdentity(file);
      identities.set(key, [...(identities.get(key) || []), file]);
    });
  const conflicts = new Set(
    [...identities]
      .filter(
        ([, group]) =>
          new Set(group.map((file) => file.reading.totalCents?.toString() ?? 'ausente')).size > 1,
      )
      .map(([key]) => key),
  );
  const uniqueFiles = [...identities.values()].map((group) => ({
    ...group[0],
    document: {
      ...group[0].document,
      links: [
        ...new Map(
          group
            .flatMap((file) => file.document.links)
            .map((link) => [`${link.recordId}:${link.orderId}`, link]),
        ).values(),
      ],
    },
  }));
  identities.forEach((group, key) => {
    if (group.length > 1 && new Set(group.map((file) => file.hash)).size > 1)
      add(
        union(group.flatMap((file) => file.document.links.map((link) => link.recordId))).filter(
          (id) => byId.has(id),
        ),
        'Duplicidade fiscal',
        conflicts.has(key) ? 'Divergência' : 'Revisão manual',
        conflicts.has(key)
          ? 'Arquivos com a mesma chave fiscal apresentam totais diferentes. Não foi escolhido um valor como correto nem totalizado automaticamente.'
          : 'Arquivos diferentes apresentam a mesma chave fiscal. Originais preservados e total considerado uma única vez.',
        {
          fileKeys: group.map((file) => file.document.key),
          evidence: group[0].reading.accessKey || '',
        },
      );
  });

  // Connected components preserve invoices shared by multiple references instead of comparing the full invoice to each CMP.
  const remaining = new Set(records.filter((record) => record.active).map((record) => record.id));
  while (remaining.size) {
    const component = new Set([remaining.values().next().value!]);
    let changed = true;
    while (changed) {
      changed = false;
      identities.forEach((group) => {
        const linked = union(
          group.flatMap((file) => file.document.links.map((link) => link.recordId)),
        );
        if (linked.some((id) => component.has(id)))
          linked
            .filter((id) => remaining.has(id))
            .forEach((id) => {
              if (!component.has(id)) {
                component.add(id);
                changed = true;
              }
            });
      });
    }
    component.forEach((id) => remaining.delete(id));
    const ids = [...component];
    const docs = uniqueFiles.filter((file) =>
      (identities.get(fiscalIdentity(file)) || []).some((alias) =>
        alias.document.links.some((link) => component.has(link.recordId)),
      ),
    );
    const allFiles = files.filter((file) =>
      file.document.links.some((link) => component.has(link.recordId)),
    );
    const invoices = docs.filter((file) => file.document.type === 'invoice');
    const links = allFiles.flatMap((file) => file.document.links);
    const outside =
      links.some((link) => !component.has(link.recordId)) ||
      allFiles.some((file) =>
        (file.document.possibleLinks || []).some((link) => !component.has(link.recordId)),
      );
    const globalSystem = nullableSum(ids.map((id) => byId.get(id)!.totalCents));
    const total = invoices.length
      ? nullableSum(
          invoices.map((file) =>
            conflicts.has(fiscalIdentity(file)) ? null : file.reading.totalCents,
          ),
        )
      : null;
    const conclusive =
      !outside &&
      globalSystem !== null &&
      total !== null &&
      allFiles.every((file) => !file.error && file.reading.reliable && !file.reading.cancelled) &&
      docs.every((file) => file.document.type === 'invoice');
    const difference = conclusive ? total - globalSystem : null;
    add(
      ids,
      'Total global das referências',
      conclusive ? (difference === 0n ? 'Conferido' : 'Divergência') : 'Não verificável',
      conclusive
        ? 'Comparação do valor integral das referências com as notas únicas do grupo. A conferência do total não confirma automaticamente itens, destinatário ou rateio por loja.'
        : 'Comparação não conclusiva: documento ausente/ilegível, recibo, valor desconhecido, cancelamento ou vínculo fora da seleção. Totais legíveis são informativos e não foram imputados integralmente à loja.',
      {
        fileKeys: allFiles.map((file) => file.document.key),
        systemCents: globalSystem,
        fiscalCents: total,
        differenceCents: difference,
      },
    );
  }

  const fiscalItems = uniqueFiles
    .filter(
      (file) =>
        file.document.type === 'invoice' &&
        file.reading.reliable &&
        !file.reading.cancelled &&
        !conflicts.has(fiscalIdentity(file)),
    )
    .flatMap((file) =>
      file.reading.items.map((item) => ({ file, item, key: `${fiscalIdentity(file)}:${item.id}` })),
    );
  const systemItems = records
    .filter((record) => record.active)
    .flatMap((record) =>
      record.items.filter((item) => item.included).map((item) => ({ record, item })),
    );
  const possibilities = systemItems.map(({ record, item }) => ({
    record,
    item,
    matches: fiscalItems.filter(
      ({ file, item: fiscalItem }) =>
        file.document.links.some(
          (link) => link.recordId === record.id && (!link.orderId || link.orderId === item.orderId),
        ) &&
        normalizedFiscalText(item.description) === normalizedFiscalText(fiscalItem.description) &&
        item.unit !== null &&
        fiscalItem.unit !== null &&
        normalizedFiscalText(item.unit) === normalizedFiscalText(fiscalItem.unit),
    ),
  }));
  const used = new Set<string>();
  possibilities.forEach(({ record, item, matches }) => {
    const match = matches.length === 1 ? matches[0] : null;
    const uniqueMatch =
      match &&
      possibilities.filter((entry) =>
        entry.matches.some((candidate) => candidate.key === match.key),
      ).length === 1 &&
      match.file.document.links.every((link) => byId.has(link.recordId)) &&
      match.file.document.links.length === 1;
    if (!uniqueMatch || !match) {
      add(
        [record.id],
        'Correspondência de item',
        'Revisão manual',
        'Item sem correspondência única confirmada. Descrição semelhante, documento compartilhado ou leitura parcial não comprova associação.',
        {
          systemItem: item.description,
          systemQuantity: item.quantity,
          systemCents: item.subtotalCents,
          fileKeys: record.documents.map((doc) => doc.key),
          fiscalItem: matches.length
            ? matches.map((entry) => entry.item.description).join('; ')
            : null,
        },
      );
      return;
    }
    used.add(match.key);
    const valuesKnown =
      item.quantity !== null &&
      match.item.quantity !== null &&
      item.unitPrice !== null &&
      match.item.unitPrice !== null &&
      item.subtotalCents !== null &&
      match.item.productCents !== null;
    const same =
      valuesKnown &&
      decimal(item.quantity) === decimal(match.item.quantity) &&
      decimal(item.unitPrice) === decimal(match.item.unitPrice) &&
      item.subtotalCents === match.item.productCents;
    add(
      [record.id],
      'Quantidade / preço / subtotal do item',
      !valuesKnown ? 'Não verificável' : same ? 'Conferido' : 'Divergência',
      `Associação única por vínculo documental, descrição exata e unidade. Preço unitário sistema: ${item.unitPrice ?? 'Não informado'}; nota: ${match.item.unitPrice ?? 'Não informado'}. Subtotal compara produtos antes de frete/desconto.`,
      {
        systemItem: item.description,
        fiscalItem: match.item.description,
        fileKeys: [match.file.document.key],
        systemQuantity: item.quantity,
        fiscalQuantity: match.item.quantity,
        systemCents: item.subtotalCents,
        fiscalCents: match.item.productCents,
        differenceCents: valuesKnown ? match.item.productCents! - item.subtotalCents! : null,
        evidence: match.item.evidence,
      },
    );
    const components = [
      ['Frete do item', item.freightCents, match.item.freightCents],
      ['Desconto do item', item.discountCents, match.item.discountCents],
      ['Outras despesas do item', item.otherCents, match.item.otherCents],
    ] as const;
    components.forEach(([label, system, fiscal]) =>
      add(
        [record.id],
        label,
        system === null || fiscal === null
          ? 'Não verificável'
          : system === fiscal
            ? 'Conferido'
            : 'Divergência',
        system === null || fiscal === null
          ? 'Componente não discriminado em uma das origens. Campo ausente não foi preenchido com zero.'
          : 'Comparação exata dos componentes discriminados por item, sem tolerância monetária.',
        {
          systemItem: item.description,
          fiscalItem: match.item.description,
          fileKeys: [match.file.document.key],
          systemCents: system,
          fiscalCents: fiscal,
          differenceCents: system === null || fiscal === null ? null : fiscal - system,
          evidence: match.item.evidence,
        },
      ),
    );
  });
  fiscalItems
    .filter(({ key }) => !used.has(key))
    .forEach(({ file, item }) =>
      add(
        file.document.links.map((link) => link.recordId).filter((id) => byId.has(id)),
        'Item fiscal sem correspondência confirmada',
        'Revisão manual',
        'Item da nota sem associação única aos itens selecionados; pode pertencer a outra referência ou ter descrição diferente.',
        {
          fileKeys: [file.document.key],
          fiscalItem: item.description,
          fiscalQuantity: item.quantity,
          fiscalCents: item.productCents,
          evidence: item.evidence,
        },
      ),
    );
  return findings;
}

export function auditSummary(records: AuditRecord[], files: AuditFile[], storeId: string) {
  const selected = new Set(records.map((record) => record.id));
  const active = records.filter((record) => record.active);
  const groups = new Map<string, AuditFile[]>();
  files
    .filter((file) => !file.error)
    .forEach((file) =>
      groups.set(fiscalIdentity(file), [...(groups.get(fiscalIdentity(file)) || []), file]),
    );
  const invoices = [...groups.values()].filter((group) =>
    group.some((file) => file.document.type === 'invoice'),
  );
  const readable = invoices.filter(
    (group) =>
      group[0].reading.totalCents !== null &&
      new Set(group.map((file) => file.reading.totalCents?.toString())).size === 1,
  );
  const attributable = readable.filter((group) =>
    group.every(
      (file) =>
        !(file.document.possibleLinks || []).some((link) => !selected.has(link.recordId)) &&
        file.reading.reliable &&
        !file.reading.cancelled &&
        file.document.links.every(
          (link) =>
            selected.has(link.recordId) &&
            link.storeIds.length === 1 &&
            link.storeIds[0] === storeId &&
            (link.explicitStores ||
              records.find((record) => record.id === link.recordId)?.storeIds.length === 1),
        ),
    ),
  );
  return {
    systemCents: nullableSum(active.map((record) => record.storeCents)),
    systemKnownCents: active.reduce((sum, record) => sum + (record.storeCents ?? 0n), 0n),
    unknownRecords: active.filter((record) => record.storeCents === null).length,
    uniqueInvoiceCount: invoices.length,
    readableInvoiceCents: readable.reduce((sum, group) => sum + group[0].reading.totalCents!, 0n),
    unreadableInvoices: invoices.length - readable.length,
    attributableInvoiceCents: attributable.reduce(
      (sum, group) => sum + (group[0].reading.totalCents ?? 0n),
      0n,
    ),
    unattributedInvoices: invoices.length - attributable.length,
    failedFiles: files.filter((file) => file.error).length,
  };
}
